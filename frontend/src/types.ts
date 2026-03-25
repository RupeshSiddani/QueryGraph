export interface GraphNode {
  id: string
  type: string
  label: string
  [key: string]: string
}

export interface GraphEdge {
  source: string
  target: string
  relationship: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface PathEdge {
  source: string
  target: string
  relationship: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sql_used?: string | null
  nodes_referenced?: string[]
  edges_referenced?: PathEdge[]
  rejected?: boolean
}
