# QueryGraph — SAP Order-to-Cash Graph Query System

A context graph system that unifies fragmented SAP Order-to-Cash data into an interactive graph visualization with an LLM-powered natural language query interface.

## Live Demo

(https://querygraph.vercel.app/)

---

## Architecture

```
sap-o2c-data/ (19 JSONL entity folders)
        │
        ▼
[scripts/ingest.py]
        │
        ├── SQLite DB (querygraph.db) ─── 19 tables, ~21,000 rows
        └── NetworkX Graph (graph.json) ── 1,262 nodes, 2,484 edges
                              │
                    [FastAPI Backend]
                    ├── GET  /graph              → full graph for visualization
                    ├── GET  /nodes/{id}         → single node metadata
                    ├── GET  /graph/neighbors/{id} → 1-hop neighborhood
                    └── POST /chat               → NL → SQL → answer pipeline
                              │
                    [React Frontend]
                    ├── react-force-graph-2d     → interactive graph canvas
                    ├── Node inspector panel     → click any node for metadata
                    └── Chat panel               → send queries, view SQL, see highlights
```

---

## Database Choice: SQLite

**Why SQLite:**
- Zero-setup, single-file database — ships with Python, no server needed
- The dataset is small enough (~21k rows) that SQLite handles all analytical queries in milliseconds
- The LLM generates standard SQL — SQLite's full SQL support means no dialect friction
- The database file (`querygraph.db`) can be committed to the repo or deployed alongside the backend with no configuration

**Tradeoff acknowledged:** For a production system with millions of rows, a columnar store (DuckDB, BigQuery) or a dedicated graph DB (Neo4j) would be more appropriate. For this dataset size, SQLite is the right choice.

**Graph storage:** NetworkX graph is serialized to `graph.json` and loaded into memory at startup. This allows fast in-memory graph traversal (path finding, neighbor lookup) without a separate graph database, while keeping all analytical queries in SQLite.

---

## Graph Model

**Nodes (11 types):**

| Node Type | Count | SAP Entity |
|-----------|-------|------------|
| SalesOrder | 100 | SD Sales Order Header |
| SalesOrderItem | 167 | SD Sales Order Item |
| Delivery | 86 | Outbound Delivery Header |
| DeliveryItem | 137 | Outbound Delivery Item |
| BillingDocument | 163+80 | Billing Header + Cancellations |
| BillingItem | 245 | Billing Document Item |
| JournalEntry | 123 | FI Journal Entry Item (AR) |
| Payment | 120 | AR Payment Clearing |
| Customer | 8 | Business Partner |
| Product | 69 | Material/Product |
| Plant | 44 | Plant Master |

**Key edge relationships:**
- `SalesOrder →(sold_to)→ Customer`
- `SalesOrder →(has_item)→ SalesOrderItem →(has_material)→ Product`
- `DeliveryItem →(references_order)→ SalesOrder`
- `DeliveryItem →(belongs_to_delivery)→ Delivery`
- `BillingItem →(references_delivery)→ Delivery`
- `JournalEntry →(references_billing)→ BillingDocument`
- `Payment →(clears)→ JournalEntry`

**What was excluded from graph nodes:** `product_storage_locations` (~17,000 rows) and `product_plants` (~3,000 rows) are kept in SQLite only — including them as graph nodes would make the visualization unusable. They remain queryable via the chat interface.

---

## LLM Prompting Strategy

**Model:** `llama-3.1-8b-instant` via Groq (free tier, ~500ms latency)

**Two-stage pipeline per query:**

```
User question
      │
      ▼
[Stage 1: Domain Classifier]
  Single LLM call, max_tokens=5
  Returns "yes" or "no"
      │
      ├── "no"  → return rejection message immediately (no SQL generated)
      │
      └── "yes" ▼
          [Stage 2: SQL Generator]
            System prompt includes:
            - Full SQLite schema (all 19 table names + columns)
            - Exact join chain for O2C flow
            - CRITICAL: all values stored as TEXT (prevents numeric comparison bugs)
            - 4 example SQL patterns for common O2C queries
            - Rules: SQLite only, LIMIT 100, no mutating SQL
                  │
                  ▼
            [SQL Executor] → SQLite → raw rows
                  │
                  ├── Error → [SQL Fixer] → retry once
                  │
                  └── Success ▼
                      [Stage 3: Summarizer]
                        Converts raw rows to natural language answer
                        Concise, data-specific, references actual values
```

**Key prompt engineering decisions:**
1. **TEXT type warning** — all SQLite columns are stored as TEXT, so `WHERE id = 123` fails silently while `WHERE id = '123'` works. Explicitly calling this out in the prompt eliminated the most common failure mode.
2. **Concrete SQL examples** — providing 4 reference SQL patterns for O2C-specific queries (flow trace, incomplete flow detection, etc.) dramatically improved accuracy on complex multi-table joins.
3. **Schema in context** — the full table schema is injected at runtime (not hardcoded) so it stays accurate as the DB evolves.
4. **Retry loop** — if SQL execution fails, the error message is sent back to the LLM for one correction attempt before returning a user-friendly error.

---

## Guardrails

The system restricts responses to SAP Order-to-Cash domain data only.

**Implementation:**
1. Every query passes through a lightweight domain classifier LLM call first
2. The classifier prompt asks: *"Is this question about SAP Order-to-Cash business data?"* and returns only `yes` or `no` (max 5 tokens — very fast and cheap)
3. If `no` → immediately return the rejection message without generating any SQL
4. The SQL generator system prompt also contains a domain restriction as a secondary guardrail

**Rejection message:**
> "This system is designed to answer questions related to the provided SAP Order-to-Cash dataset only."

**Tested rejections:** general knowledge questions, creative writing requests, math questions, off-topic topics — all correctly rejected.

**Tradeoff:** A two-call approach adds ~200ms latency per query. A single-call approach (combine classifier + SQL generator) would be faster but less reliable at rejection.

---

## Running Locally

### Prerequisites
- Python 3.10+
- Node.js 18+
- Groq API key (free at https://console.groq.com)

### 1. Set up environment
```bash
# Create .env in project root
echo "GROQ_API_KEY=your_key_here" > .env
```

### 2. Install Python dependencies & run ingestion
```bash
pip install -r backend/requirements.txt
python scripts/ingest.py
```

This creates `backend/data/querygraph.db` and `backend/data/graph.json`.

### 3. Start backend
```bash
cd backend
python -m uvicorn main:app --reload --port 8000
```

### 4. Start frontend
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

---

## Example Queries

| Query | What it demonstrates |
|-------|---------------------|
| `Which products are associated with the highest number of billing documents?` | Aggregation across joined tables |
| `Trace the full flow of billing document 90504248` | Multi-table LEFT JOIN chain across full O2C flow |
| `Find sales orders that have been delivered but not billed` | Incomplete flow detection with NOT IN subquery |
| `List all customers and their total billed amounts` | GROUP BY with JOIN to business_partners |
| `Which plant handled the most deliveries?` | Aggregation on delivery items |
| `Show me all cancelled billing documents` | Filter on boolean TEXT field |

---

## Project Structure

```
QueryGraph/
├── .env                          # GROQ_API_KEY (not committed)
├── README.md
├── ASSIGNMENT.md                 # Requirements breakdown
├── PLAN.md                       # Execution plan
├── scripts/
│   └── ingest.py                 # JSONL → SQLite + NetworkX graph
├── backend/
│   ├── requirements.txt
│   ├── main.py                   # FastAPI app + endpoints
│   ├── db.py                     # SQLite connection + query runner
│   ├── graph_builder.py          # Graph load + neighbor lookup
│   ├── llm.py                    # Groq integration, prompting, guardrails
│   └── data/
│       ├── querygraph.db         # Generated by ingest.py
│       └── graph.json            # Generated by ingest.py
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── api.ts
│       ├── types.ts
│       └── components/
│           ├── GraphView.tsx     # react-force-graph-2d canvas
│           ├── ChatPanel.tsx     # Chat interface + SQL viewer
│           └── NodeInspector.tsx # Node metadata panel
└── sap-order-to-cash-dataset/    # Raw JSONL data (not committed)
```

