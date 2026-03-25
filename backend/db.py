import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "querygraph.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def execute_query(sql: str) -> list:
    conn = get_connection()
    try:
        cursor = conn.execute(sql)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_schema_info() -> str:
    conn = get_connection()
    try:
        tables = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
        schema_parts = []
        for table in tables:
            tname = table[0]
            cols = conn.execute(f'PRAGMA table_info("{tname}")').fetchall()
            col_names = [c[1] for c in cols]
            schema_parts.append(f"Table: {tname}\n  Columns: {', '.join(col_names)}")
        return "\n\n".join(schema_parts)
    finally:
        conn.close()
