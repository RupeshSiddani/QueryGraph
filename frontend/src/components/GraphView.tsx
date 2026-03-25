import React, { useRef, useCallback, useEffect, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { GraphData, GraphNode, PathEdge } from '../types'

const NODE_COLORS: Record<string, string> = {
  SalesOrder: '#3b82f6',
  SalesOrderItem: '#93c5fd',
  Delivery: '#22c55e',
  DeliveryItem: '#86efac',
  BillingDocument: '#f97316',
  BillingItem: '#fed7aa',
  JournalEntry: '#a855f7',
  Payment: '#eab308',
  Customer: '#ef4444',
  Product: '#14b8a6',
  Plant: '#94a3b8',
}

interface GraphViewProps {
  data: GraphData
  highlightedNodes: string[]
  highlightedEdges: PathEdge[]
  onNodeClick: (node: GraphNode, connections: number) => void
}

export default function GraphView({ data, highlightedNodes, highlightedEdges, onNodeClick }: GraphViewProps) {
  const fgRef = useRef<any>()
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        })
      }
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const highlightSet = new Set(highlightedNodes)
  const highlightEdgeSet = new Set(
    highlightedEdges.map((e) => `${e.source}||${e.target}`)
  )

  const graphData = {
    nodes: data.nodes.map((n) => ({ ...n })),
    links: data.edges.map((e) => ({ source: e.source, target: e.target, relationship: e.relationship })),
  }

  const connectionCount = useCallback(
    (nodeId: string) => {
      return data.edges.filter((e) => e.source === nodeId || e.target === nodeId).length
    },
    [data.edges]
  )

  const handleNodeClick = useCallback(
    (node: any) => {
      onNodeClick(node as GraphNode, connectionCount(node.id))
    },
    [onNodeClick, connectionCount]
  )

  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const isHighlighted = highlightSet.has(node.id)
      const radius = isHighlighted ? 8 : 5
      const color = NODE_COLORS[node.type] || '#94a3b8'

      if (isHighlighted) {
        // Outer glow ring
        ctx.beginPath()
        ctx.arc(node.x, node.y, radius + 5, 0, 2 * Math.PI)
        ctx.fillStyle = 'rgba(251,191,36,0.15)'
        ctx.fill()
        // Inner highlight ring
        ctx.beginPath()
        ctx.arc(node.x, node.y, radius + 2.5, 0, 2 * Math.PI)
        ctx.strokeStyle = '#fbbf24'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      ctx.beginPath()
      ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI)
      ctx.fillStyle = isHighlighted ? '#ffffff' : color
      ctx.fill()

      if (isHighlighted || globalScale >= 2) {
        const label = node.label || node.id
        const fontSize = isHighlighted ? Math.max(10 / globalScale, 8) : 10 / globalScale
        ctx.font = `bold ${fontSize}px Sans-Serif`
        ctx.fillStyle = isHighlighted ? '#fbbf24' : '#e2e8f0'
        ctx.textAlign = 'center'
        ctx.fillText(label, node.x, node.y + radius + fontSize + 2)
      }
    },
    [highlightSet]
  )

  const linkColor = useCallback(
    (link: any) => {
      const src = typeof link.source === 'object' ? link.source.id : link.source
      const tgt = typeof link.target === 'object' ? link.target.id : link.target
      if (highlightEdgeSet.has(`${src}||${tgt}`) || highlightEdgeSet.has(`${tgt}||${src}`)) {
        return '#fbbf24'
      }
      return 'rgba(148,163,184,0.2)'
    },
    [highlightEdgeSet]
  )

  const linkWidth = useCallback(
    (link: any) => {
      const src = typeof link.source === 'object' ? link.source.id : link.source
      const tgt = typeof link.target === 'object' ? link.target.id : link.target
      if (highlightEdgeSet.has(`${src}||${tgt}`) || highlightEdgeSet.has(`${tgt}||${src}`)) {
        return 2.5
      }
      return 0.8
    },
    [highlightEdgeSet]
  )

  return (
    <div ref={containerRef} className="relative w-full h-full bg-slate-950">
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => 'replace'}
        linkColor={linkColor}
        linkWidth={linkWidth}
        onNodeClick={handleNodeClick}
        backgroundColor="#020617"
        nodeRelSize={5}
        linkDirectionalArrowLength={3}
        linkDirectionalArrowRelPos={1}
        cooldownTicks={100}
        enableNodeDrag={true}
      />

      <div className="absolute bottom-4 left-4 bg-slate-900/90 border border-slate-700 rounded-xl px-3 py-2 text-xs space-y-1">
        <div className="text-slate-400 font-semibold mb-1">Node Types</div>
        {Object.entries(NODE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span className="text-slate-300">{type}</span>
          </div>
        ))}
      </div>

      <div className="absolute top-4 right-4 bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-400">
        {data.nodes.length} nodes · {data.edges.length} edges
      </div>
    </div>
  )
}
