import json
from pathlib import Path
from functools import lru_cache

GRAPH_PATH = Path(__file__).parent / "data" / "graph.json"


@lru_cache(maxsize=1)
def load_graph() -> dict:
    with open(GRAPH_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def get_full_graph() -> dict:
    return load_graph()


def get_node(node_id: str) -> dict:
    graph = load_graph()
    for node in graph["nodes"]:
        if node["id"] == node_id:
            return node
    return None


def get_neighbors(node_id: str) -> dict:
    graph = load_graph()
    nodes_map = {n["id"]: n for n in graph["nodes"]}
    neighbor_ids = set()
    related_edges = []
    for edge in graph["edges"]:
        if edge["source"] == node_id or edge["target"] == node_id:
            neighbor_ids.add(edge["source"])
            neighbor_ids.add(edge["target"])
            related_edges.append(edge)
    neighbor_ids.discard(node_id)
    return {
        "center": nodes_map.get(node_id),
        "neighbors": [nodes_map[n] for n in neighbor_ids if n in nodes_map],
        "edges": related_edges,
    }


def extract_referenced_nodes(text: str) -> list:
    """Find node IDs whose key values appear in the answer text."""
    graph = load_graph()
    referenced = []
    seen = set()
    for node in graph["nodes"]:
        node_id = node["id"]
        if node_id in seen:
            continue
        parts = node_id.split("_", 1)
        if len(parts) > 1:
            key_part = parts[1]
            if len(key_part) >= 5 and key_part in text:
                referenced.append(node_id)
                seen.add(node_id)
    return referenced


def get_path_edges(node_ids: list) -> list:
    """Return all edges that connect any two nodes within the given set."""
    if len(node_ids) < 2:
        return []
    node_set = set(node_ids)
    graph = load_graph()
    return [
        edge for edge in graph["edges"]
        if edge["source"] in node_set and edge["target"] in node_set
    ]
