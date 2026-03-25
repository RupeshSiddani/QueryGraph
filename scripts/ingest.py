#!/usr/bin/env python3
"""
Ingestion script: reads all JSONL entity folders, loads into SQLite, builds NetworkX graph.
Run from project root: python scripts/ingest.py
"""

import json
import os
import sqlite3
from pathlib import Path
import networkx as nx

DATA_DIR = Path(__file__).parent.parent / "sap-order-to-cash-dataset" / "sap-o2c-data"
DB_PATH = Path(__file__).parent.parent / "backend" / "data" / "querygraph.db"
GRAPH_PATH = Path(__file__).parent.parent / "backend" / "data" / "graph.json"

TABLE_RENAME = {
    "journal_entry_items_accounts_receivable": "journal_entry_items",
    "payments_accounts_receivable": "payments",
}


def flatten_record(record: dict, prefix: str = "") -> dict:
    flat = {}
    for key, value in record.items():
        full_key = f"{prefix}_{key}" if prefix else key
        if isinstance(value, dict):
            flat.update(flatten_record(value, full_key))
        else:
            flat[full_key] = value
    return flat


def load_entity(folder_path: Path) -> list:
    records = []
    for jsonl_file in sorted(folder_path.glob("*.jsonl")):
        with open(jsonl_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        records.append(flatten_record(json.loads(line)))
                    except json.JSONDecodeError:
                        pass
    return records


def create_table(conn: sqlite3.Connection, table_name: str, records: list):
    if not records:
        print(f"  Skipping '{table_name}' (no records)")
        return
    all_cols = set()
    for r in records:
        all_cols.update(r.keys())
    cols = sorted(all_cols)

    col_defs = ", ".join(f'"{c}" TEXT' for c in cols)
    conn.execute(f'DROP TABLE IF EXISTS "{table_name}"')
    conn.execute(f'CREATE TABLE "{table_name}" ({col_defs})')

    placeholders = ", ".join("?" for _ in cols)
    for record in records:
        values = [
            str(record[c]) if record.get(c) is not None else None
            for c in cols
        ]
        conn.execute(f'INSERT INTO "{table_name}" VALUES ({placeholders})', values)
    conn.commit()
    print(f"  Loaded {len(records):>5} rows into '{table_name}'")


def fetch(conn: sqlite3.Connection, table: str, cols: list) -> list:
    try:
        cols_sql = ", ".join(f'"{c}"' for c in cols)
        return conn.execute(f'SELECT {cols_sql} FROM "{table}"').fetchall()
    except Exception as e:
        print(f"  Warning: could not fetch from {table}: {e}")
        return []


def build_graph(conn: sqlite3.Connection) -> nx.DiGraph:
    G = nx.DiGraph()

    def add_node(node_id, node_type, label, **attrs):
        G.add_node(node_id, type=node_type, label=label, **{k: str(v) if v is not None else "" for k, v in attrs.items()})

    def add_edge(src, dst, rel):
        if G.has_node(src) and G.has_node(dst) and src != dst:
            G.add_edge(src, dst, relationship=rel)

    # Business Partners
    for row in fetch(conn, "business_partners", ["businessPartner", "businessPartnerFullName", "businessPartnerIsBlocked"]):
        add_node(f"BP_{row[0]}", "Customer", row[1] or row[0], blocked=row[2])

    # Products
    for row in fetch(conn, "products", ["product", "productOldId", "productType", "productGroup"]):
        add_node(f"PROD_{row[0]}", "Product", row[1] or row[0], productType=row[2], productGroup=row[3])

    # Plants
    for row in fetch(conn, "plants", ["plant", "plantName"]):
        add_node(f"PLANT_{row[0]}", "Plant", row[1] or row[0])

    # Sales Order Headers
    for row in fetch(conn, "sales_order_headers", ["salesOrder", "soldToParty", "totalNetAmount", "overallDeliveryStatus", "transactionCurrency", "creationDate"]):
        so_id = f"SO_{row[0]}"
        add_node(so_id, "SalesOrder", f"SO {row[0]}", amount=row[2], currency=row[4], deliveryStatus=row[3], creationDate=row[5])
        if row[1]:
            add_edge(so_id, f"BP_{row[1]}", "sold_to")

    # Sales Order Items
    for row in fetch(conn, "sales_order_items", ["salesOrder", "salesOrderItem", "material", "requestedQuantity", "netAmount", "productionPlant"]):
        soi_id = f"SOI_{row[0]}_{row[1]}"
        add_node(soi_id, "SalesOrderItem", f"SOI {row[0]}/{row[1]}", qty=row[3], amount=row[4])
        add_edge(f"SO_{row[0]}", soi_id, "has_item")
        if row[2]:
            add_edge(soi_id, f"PROD_{row[2]}", "has_material")
        if row[5]:
            add_edge(soi_id, f"PLANT_{row[5]}", "produced_at")

    # Outbound Delivery Headers
    for row in fetch(conn, "outbound_delivery_headers", ["deliveryDocument", "overallGoodsMovementStatus", "shippingPoint", "creationDate"]):
        add_node(f"DEL_{row[0]}", "Delivery", f"DEL {row[0]}", goodsMovement=row[1], shippingPoint=row[2], creationDate=row[3])

    # Outbound Delivery Items
    for row in fetch(conn, "outbound_delivery_items", ["deliveryDocument", "deliveryDocumentItem", "referenceSdDocument", "referenceSdDocumentItem", "plant", "actualDeliveryQuantity"]):
        deli_id = f"DELI_{row[0]}_{row[1]}"
        add_node(deli_id, "DeliveryItem", f"DELI {row[0]}/{row[1]}", qty=row[5])
        add_edge(deli_id, f"DEL_{row[0]}", "belongs_to_delivery")
        if row[2]:
            add_edge(deli_id, f"SO_{row[2]}", "references_order")
        if row[4]:
            add_edge(deli_id, f"PLANT_{row[4]}", "shipped_from")

    # Billing Document Headers + Cancellations (merged)
    for table in ["billing_document_headers", "billing_document_cancellations"]:
        for row in fetch(conn, table, ["billingDocument", "soldToParty", "totalNetAmount", "billingDocumentIsCancelled", "accountingDocument", "transactionCurrency", "billingDocumentDate"]):
            bd_id = f"BD_{row[0]}"
            if not G.has_node(bd_id):
                add_node(bd_id, "BillingDocument", f"BD {row[0]}", amount=row[2], cancelled=row[3], currency=row[5], date=row[6])
                if row[1]:
                    add_edge(bd_id, f"BP_{row[1]}", "billed_to")

    # Billing Document Items
    for row in fetch(conn, "billing_document_items", ["billingDocument", "billingDocumentItem", "material", "billingQuantity", "netAmount", "referenceSdDocument"]):
        bdi_id = f"BDI_{row[0]}_{row[1]}"
        add_node(bdi_id, "BillingItem", f"BDI {row[0]}/{row[1]}", qty=row[3], amount=row[4])
        add_edge(bdi_id, f"BD_{row[0]}", "belongs_to_billing")
        if row[5]:
            add_edge(bdi_id, f"DEL_{row[5]}", "references_delivery")
        if row[2]:
            add_edge(bdi_id, f"PROD_{row[2]}", "billed_material")

    # Journal Entry Items
    for row in fetch(conn, "journal_entry_items", ["accountingDocument", "accountingDocumentItem", "referenceDocument", "customer", "amountInTransactionCurrency", "transactionCurrency", "postingDate", "clearingAccountingDocument"]):
        je_id = f"JE_{row[0]}_{row[1]}"
        add_node(je_id, "JournalEntry", f"JE {row[0]}/{row[1]}", amount=row[4], currency=row[5], date=row[6], clearingDoc=row[7])
        if row[2]:
            add_edge(je_id, f"BD_{row[2]}", "references_billing")
        if row[3]:
            add_edge(je_id, f"BP_{row[3]}", "for_customer")

    # Payments — link to journal entries via clearingAccountingDocument
    for row in fetch(conn, "payments", ["accountingDocument", "accountingDocumentItem", "customer", "amountInTransactionCurrency", "transactionCurrency", "postingDate", "clearingAccountingDocument"]):
        pay_id = f"PAY_{row[0]}_{row[1]}"
        add_node(pay_id, "Payment", f"PAY {row[0]}/{row[1]}", amount=row[3], currency=row[4], date=row[5])
        if row[2]:
            add_edge(pay_id, f"BP_{row[2]}", "paid_by")
        if row[6]:
            for je_row in conn.execute(
                'SELECT "accountingDocument", "accountingDocumentItem" FROM "journal_entry_items" WHERE "clearingAccountingDocument" = ?',
                (str(row[6]),)
            ).fetchall():
                add_edge(pay_id, f"JE_{je_row[0]}_{je_row[1]}", "clears")

    return G


def main():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    print("=" * 55)
    print("Step 1: Loading JSONL data into SQLite...")
    print("=" * 55)
    conn = sqlite3.connect(DB_PATH)

    for entity_dir in sorted(DATA_DIR.iterdir()):
        if entity_dir.is_dir():
            records = load_entity(entity_dir)
            table_name = TABLE_RENAME.get(entity_dir.name, entity_dir.name)
            create_table(conn, table_name, records)

    print()
    print("=" * 55)
    print("Step 2: Building NetworkX graph...")
    print("=" * 55)
    G = build_graph(conn)

    type_counts = {}
    for n in G.nodes():
        t = G.nodes[n].get("type", "unknown")
        type_counts[t] = type_counts.get(t, 0) + 1

    print(f"  Total nodes : {G.number_of_nodes()}")
    print(f"  Total edges : {G.number_of_edges()}")
    for t, c in sorted(type_counts.items()):
        print(f"    {t}: {c}")

    print()
    print("=" * 55)
    print(f"Step 3: Saving graph to {GRAPH_PATH}...")
    print("=" * 55)
    graph_data = {
        "nodes": [
            {"id": n, **G.nodes[n]}
            for n in G.nodes()
        ],
        "edges": [
            {"source": u, "target": v, "relationship": G.edges[u, v].get("relationship", "")}
            for u, v in G.edges()
        ],
    }
    with open(GRAPH_PATH, "w", encoding="utf-8") as f:
        json.dump(graph_data, f)

    conn.close()
    print(f"\nDone!")
    print(f"  DB    : {DB_PATH}")
    print(f"  Graph : {GRAPH_PATH}")


if __name__ == "__main__":
    main()
