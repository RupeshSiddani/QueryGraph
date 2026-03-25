import { GraphData, ChatMessage, PathEdge } from './types'

// Local dev uses Vite proxy at /api. In production set VITE_API_BASE_URL
// e.g. https://your-backend.onrender.com
const BASE = (import.meta as any).env?.VITE_API_BASE_URL || '/api'

export async function fetchGraph(): Promise<GraphData> {
  const res = await fetch(`${BASE}/graph`)
  if (!res.ok) throw new Error('Failed to fetch graph')
  return res.json()
}

export async function fetchNode(nodeId: string) {
  const res = await fetch(`${BASE}/nodes/${encodeURIComponent(nodeId)}`)
  if (!res.ok) throw new Error('Node not found')
  return res.json()
}

export async function fetchNeighbors(nodeId: string) {
  const res = await fetch(`${BASE}/graph/neighbors/${encodeURIComponent(nodeId)}`)
  if (!res.ok) throw new Error('Failed to fetch neighbors')
  return res.json()
}

export async function sendChat(
  message: string,
  history: ChatMessage[]
): Promise<{ answer: string; sql_used: string | null; nodes_referenced: string[]; edges_referenced: PathEdge[]; rejected: boolean }> {
  const apiHistory = history.map((m) => ({
    role: m.role,
    content: m.content,
  }))
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history: apiHistory }),
  })
  if (!res.ok) throw new Error('Chat request failed')
  return res.json()
}
