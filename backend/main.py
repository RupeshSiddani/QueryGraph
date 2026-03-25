from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from db import execute_query, get_schema_info
from graph_builder import get_full_graph, get_node, get_neighbors, extract_referenced_nodes, get_path_edges
from llm import is_domain_relevant, generate_sql, fix_sql, summarize_results, REJECTION

app = FastAPI(title="QueryGraph API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_schema_cache: Optional[str] = None


def get_schema() -> str:
    global _schema_cache
    if _schema_cache is None:
        _schema_cache = get_schema_info()
    return _schema_cache


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/graph")
def graph():
    return get_full_graph()


@app.get("/nodes/{node_id:path}")
def node_detail(node_id: str):
    node = get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@app.get("/graph/neighbors/{node_id:path}")
def neighbors(node_id: str):
    return get_neighbors(node_id)


class ChatRequest(BaseModel):
    message: str
    history: Optional[list] = []


@app.post("/chat")
def chat(req: ChatRequest):
    schema = get_schema()

    if not is_domain_relevant(req.message):
        return {
            "answer": REJECTION,
            "sql_used": None,
            "nodes_referenced": [],
            "rejected": True,
        }

    sql = generate_sql(req.message, schema, req.history)

    results = None
    try:
        results = execute_query(sql)
    except Exception as e:
        fixed_sql = fix_sql(req.message, schema, sql, str(e))
        try:
            results = execute_query(fixed_sql)
            sql = fixed_sql
        except Exception as e2:
            return {
                "answer": f"I could not generate a valid query for your question. Please try rephrasing.",
                "sql_used": fixed_sql,
                "nodes_referenced": [],
                "rejected": False,
            }

    if not results:
        answer = "No records found matching your query."
    else:
        answer = summarize_results(req.message, sql, results)

    combined_text = answer + " " + str(results[:20])
    nodes_referenced = extract_referenced_nodes(combined_text)
    edges_referenced = get_path_edges(nodes_referenced)

    return {
        "answer": answer,
        "sql_used": sql,
        "nodes_referenced": nodes_referenced,
        "edges_referenced": edges_referenced,
        "rejected": False,
    }
