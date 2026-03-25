import React from 'react'
import { X } from 'lucide-react'
import { GraphNode } from '../types'

const TYPE_COLORS: Record<string, string> = {
  SalesOrder: 'bg-blue-500',
  SalesOrderItem: 'bg-blue-300',
  Delivery: 'bg-green-500',
  DeliveryItem: 'bg-green-300',
  BillingDocument: 'bg-orange-500',
  BillingItem: 'bg-orange-300',
  JournalEntry: 'bg-purple-500',
  Payment: 'bg-yellow-400',
  Customer: 'bg-red-500',
  Product: 'bg-teal-500',
  Plant: 'bg-stone-400',
}

interface NodeInspectorProps {
  node: GraphNode | null
  connections: number
  onClose: () => void
}

const HIDDEN_FIELDS = new Set(['id', 'type', 'label'])

export default function NodeInspector({ node, connections, onClose }: NodeInspectorProps) {
  if (!node) return null

  const colorClass = TYPE_COLORS[node.type] || 'bg-slate-500'
  const extraFields = Object.entries(node).filter(
    ([k, v]) => !HIDDEN_FIELDS.has(k) && v !== '' && v !== null && v !== undefined
  )

  return (
    <div className="absolute top-4 left-4 w-72 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl z-10 text-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-600">
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${colorClass}`} />
          <span className="font-semibold text-white">{node.type}</span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="px-4 py-3 space-y-1.5 max-h-96 overflow-y-auto">
        <div className="flex justify-between">
          <span className="text-slate-400">ID</span>
          <span className="text-white font-mono text-xs break-all text-right max-w-[60%]">{node.id}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Label</span>
          <span className="text-white text-right max-w-[60%]">{node.label}</span>
        </div>

        {extraFields.length > 0 && (
          <div className="border-t border-slate-700 pt-2 mt-2 space-y-1.5">
            {extraFields.map(([key, value]) => (
              <div key={key} className="flex justify-between gap-2">
                <span className="text-slate-400 shrink-0">{key}</span>
                <span className="text-slate-200 text-right text-xs break-all max-w-[60%]">
                  {String(value)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-slate-700 pt-2 mt-2">
          <span className="text-slate-400">Connections: </span>
          <span className="text-white font-semibold">{connections}</span>
        </div>
      </div>
    </div>
  )
}
