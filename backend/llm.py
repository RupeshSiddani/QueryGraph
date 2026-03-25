import os
from pathlib import Path
from groq import Groq
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

_api_key = os.getenv("GROQ_API_KEY")
if not _api_key:
    raise RuntimeError(
        "GROQ_API_KEY is not set. Set it in your environment (recommended) or in the project root .env file."
    )

client = Groq(api_key=_api_key)
MODEL = "llama-3.1-8b-instant"

REJECTION = "This system is designed to answer questions related to the provided SAP Order-to-Cash dataset only."

SYSTEM_PROMPT_TEMPLATE = """You are a data analyst assistant for an SAP Order-to-Cash (O2C) system.
You ONLY answer questions about the SAP O2C dataset provided.

The SQLite database has these tables and columns:
{schema}

CRITICAL: ALL column values are stored as TEXT (strings) in SQLite. Always compare with string literals.
Good: WHERE billingDocument = '90504248'
Bad:  WHERE billingDocument = 90504248

Key join relationships (use these exact column names):
- sales_order_headers.salesOrder = sales_order_items.salesOrder
- sales_order_headers.soldToParty = business_partners.businessPartner
- sales_order_items.material = products.product
- sales_order_items.productionPlant = plants.plant
- outbound_delivery_items.referenceSdDocument = sales_order_headers.salesOrder  (delivery → sales order)
- outbound_delivery_items.deliveryDocument = outbound_delivery_headers.deliveryDocument
- outbound_delivery_items.plant = plants.plant
- billing_document_items.referenceSdDocument = outbound_delivery_headers.deliveryDocument  (billing → delivery)
- billing_document_items.billingDocument = billing_document_headers.billingDocument
- billing_document_headers.soldToParty = business_partners.businessPartner
- billing_document_headers.accountingDocument = journal_entry_items.accountingDocument
- journal_entry_items.referenceDocument = billing_document_headers.billingDocument
- journal_entry_items.clearingAccountingDocument = payments.clearingAccountingDocument
- journal_entry_items.customer = business_partners.businessPartner

O2C Full Flow: SalesOrder → DeliveryItems (via referenceSdDocument) → DeliveryHeaders → BillingItems (via referenceSdDocument) → BillingHeaders → JournalEntries (via accountingDocument) → Payments (via clearingAccountingDocument)

EXAMPLE SQL PATTERNS:

1. Trace full O2C flow for a billing document:
SELECT
    odi.referenceSdDocument AS salesOrder,
    bdh.billingDocument,
    odh.deliveryDocument,
    je.accountingDocument AS journalEntry,
    p.accountingDocument AS payment,
    bdh.totalNetAmount,
    bdh.transactionCurrency
FROM billing_document_headers bdh
LEFT JOIN billing_document_items bdi ON bdi.billingDocument = bdh.billingDocument
LEFT JOIN outbound_delivery_headers odh ON odh.deliveryDocument = bdi.referenceSdDocument
LEFT JOIN outbound_delivery_items odi ON odi.deliveryDocument = odh.deliveryDocument
LEFT JOIN journal_entry_items je ON je.accountingDocument = bdh.accountingDocument
LEFT JOIN payments p ON p.clearingAccountingDocument = je.clearingAccountingDocument
WHERE bdh.billingDocument = '<ID>'
LIMIT 10;

2. Find sales orders delivered but NOT billed (incomplete flow):
SELECT DISTINCT soh.salesOrder, soh.totalNetAmount, soh.creationDate
FROM sales_order_headers soh
INNER JOIN outbound_delivery_items odi ON odi.referenceSdDocument = soh.salesOrder
WHERE soh.salesOrder NOT IN (
    SELECT DISTINCT odi2.referenceSdDocument
    FROM outbound_delivery_items odi2
    INNER JOIN billing_document_items bdi ON bdi.referenceSdDocument = odi2.deliveryDocument
)
LIMIT 100;

3. Find billing documents with no journal entry (incomplete flow):
SELECT bdh.billingDocument, bdh.totalNetAmount, bdh.soldToParty
FROM billing_document_headers bdh
LEFT JOIN journal_entry_items je ON je.accountingDocument = bdh.accountingDocument
WHERE je.accountingDocument IS NULL
LIMIT 100;

4. Products with most billing documents:
SELECT bdi.material, COUNT(DISTINCT bdi.billingDocument) AS billing_count
FROM billing_document_items bdi
GROUP BY bdi.material
ORDER BY billing_count DESC
LIMIT 10;

Rules:
- Generate only valid SQLite SQL.
- ALL values are TEXT — always use string literals in WHERE clauses.
- Return at most 100 rows (add LIMIT 100 if no limit specified).
- Do NOT generate DROP, DELETE, UPDATE, INSERT, or any mutating SQL.
- Always use LEFT JOIN when tracing flows to avoid missing records.
"""

CLASSIFIER_PROMPT = """You are a domain classifier. Answer with ONLY the single word 'yes' or 'no'.

The domain is: SAP Order-to-Cash business data — sales orders, deliveries, billing documents, payments, customers, products, plants, journal entries.

Is the following question about this SAP O2C domain?

Question: {question}"""


def is_domain_relevant(question: str) -> bool:
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "user", "content": CLASSIFIER_PROMPT.format(question=question)},
        ],
        max_tokens=5,
        temperature=0,
    )
    answer = response.choices[0].message.content.strip().lower()
    return answer.startswith("y")


def _extract_sql(content: str) -> str:
    if "```sql" in content:
        return content.split("```sql")[1].split("```")[0].strip()
    if "```" in content:
        return content.split("```")[1].split("```")[0].strip()
    lines = [l for l in content.strip().splitlines() if l.upper().startswith(("SELECT", "WITH"))]
    return lines[0] if lines else content.strip()


def generate_sql(question: str, schema: str, history: list = None) -> str:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT_TEMPLATE.format(schema=schema)},
    ]
    if history:
        messages.extend(history[-4:])
    messages.append({"role": "user", "content": f"Write a SQL query to answer: {question}\nReturn ONLY the SQL, wrapped in ```sql ... ```"})

    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        max_tokens=1000,
        temperature=0,
    )
    return _extract_sql(response.choices[0].message.content)


def fix_sql(question: str, schema: str, bad_sql: str, error: str) -> str:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT_TEMPLATE.format(schema=schema)},
        {"role": "user", "content": f"Write a SQL query to answer: {question}"},
        {"role": "assistant", "content": f"```sql\n{bad_sql}\n```"},
        {"role": "user", "content": f"That SQL failed with error: {error}\nPlease fix it and return ONLY the corrected SQL wrapped in ```sql ... ```"},
    ]
    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        max_tokens=600,
        temperature=0,
    )
    return _extract_sql(response.choices[0].message.content)


def summarize_results(question: str, sql: str, results: list) -> str:
    results_preview = results[:50]
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "You answer questions about SAP Order-to-Cash data. "
                    "Write like a real person explaining things to a smart friend. "
                    "Keep it simple and clear. Slightly informal is fine. "
                    "No corporate jargon, no buzzwords, no em dashes, no unnecessary technical language. "
                    "Do not use em dashes (--) or excessive emojis. "
                    "Always format your answer as neat bullet points. "
                    "Each bullet should be one clear fact or insight from the data. "
                    "Use actual numbers and names from the results. "
                    "If there is a single number answer, still wrap it in a bullet point. "
                    "Keep bullets short and punchy, not long paragraphs."
                ),
            },
            {
                "role": "user",
                "content": f"Question: {question}\n\nResults ({len(results)} rows):\n{results_preview}\n\nAnswer in bullet points:",
            },
        ],
        max_tokens=500,
        temperature=0.2,
    )
    return response.choices[0].message.content.strip()
