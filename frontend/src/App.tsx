import React, { useEffect, useState, useRef, useCallback } from 'react'
import GraphView from './components/GraphView'
import ChatPanel from './components/ChatPanel'
import NodeInspector from './components/NodeInspector'
import { fetchGraph } from './api'
import { GraphData, GraphNode, PathEdge } from './types'

const MIN_CHAT_WIDTH = 240
const MAX_CHAT_WIDTH = 620
const DEFAULT_CHAT_WIDTH = 320

export default function App() {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [selectedNodeConnections, setSelectedNodeConnections] = useState(0)
  const [highlightedNodes, setHighlightedNodes] = useState<string[]>([])
  const [highlightedEdges, setHighlightedEdges] = useState<PathEdge[]>([])
  const [chatWidth, setChatWidth] = useState(DEFAULT_CHAT_WIDTH)
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(DEFAULT_CHAT_WIDTH)

  useEffect(() => {
    fetchGraph()
      .then(setGraphData)
      .catch(() => setError('Failed to connect to backend. Make sure the API server is running.'))
      .finally(() => setLoading(false))
  }, [])

  const onDragStart = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    dragStartX.current = e.clientX
    dragStartWidth.current = chatWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [chatWidth])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const delta = dragStartX.current - e.clientX
      const newWidth = Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, dragStartWidth.current + delta))
      setChatWidth(newWidth)
    }
    const onMouseUp = () => {
      if (!isDragging.current) return
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const handleNodeClick = (node: GraphNode, connections: number) => {
    setSelectedNode(node)
    setSelectedNodeConnections(connections)
  }

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white">
      <header className="flex items-center gap-3 px-5 py-3 bg-slate-900 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-indigo-500" />
          <span className="text-slate-400 text-sm">Mapping</span>
          <span className="text-slate-600">/</span>
          <span className="font-semibold text-white">Order to Cash</span>
        </div>
        <div className="ml-auto flex items-center gap-2 text-sm text-slate-400">
          {!loading && !error && (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span>{graphData.nodes.length} nodes · {graphData.edges.length} edges</span>
            </>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative overflow-hidden">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
              <div className="text-center space-y-3">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-slate-400 text-sm">Loading graph...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
              <div className="text-center space-y-3 max-w-md px-6">
                <div className="text-red-400 text-4xl">⚠</div>
                <p className="text-white font-semibold">Connection Error</p>
                <p className="text-slate-400 text-sm">{error}</p>
                <code className="block text-xs text-green-400 bg-slate-900 rounded-lg p-3 text-left">
                  cd backend{'\n'}
                  uvicorn main:app --reload
                </code>
              </div>
            </div>
          )}

          {!loading && !error && (
            <>
              <GraphView
                data={graphData}
                highlightedNodes={highlightedNodes}
                highlightedEdges={highlightedEdges}
                onNodeClick={handleNodeClick}
              />
              {selectedNode && (
                <NodeInspector
                  node={selectedNode}
                  connections={selectedNodeConnections}
                  onClose={() => setSelectedNode(null)}
                />
              )}
            </>
          )}
        </div>

        {/* Drag handle */}
        <div
          onMouseDown={onDragStart}
          className="w-1 shrink-0 bg-slate-700 hover:bg-indigo-500 cursor-col-resize transition-colors relative group"
          title="Drag to resize chat panel"
        >
          <div className="absolute inset-y-0 -left-1 -right-1" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <span className="w-1 h-1 rounded-full bg-indigo-400" />
            <span className="w-1 h-1 rounded-full bg-indigo-400" />
            <span className="w-1 h-1 rounded-full bg-indigo-400" />
          </div>
        </div>

        {/* Chat panel — resizable */}
        <div style={{ width: chatWidth }} className="shrink-0 flex flex-col min-w-0">
          <ChatPanel
            onPathHighlighted={(nodes, edges) => {
              setHighlightedNodes(nodes)
              setHighlightedEdges(edges)
            }}
          />
        </div>
      </div>
    </div>
  )
}
