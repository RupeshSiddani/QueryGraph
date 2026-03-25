import React, { useState, useRef, useEffect } from 'react'
import { Send, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'
import { ChatMessage, PathEdge } from '../types'
import { sendChat } from '../api'

function MessageContent({ text }: { text: string }) {
  const lines = text.split('\n').filter((l) => l.trim() !== '')
  const isBullet = (l: string) => /^[\*\-\•]\s/.test(l.trim())
  const stripBullet = (l: string) => l.trim().replace(/^[\*\-\•]\s+/, '')

  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => (
        isBullet(line) ? (
          <div key={i} className="flex gap-2 items-start">
            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
            <span className="block leading-snug">{stripBullet(line)}</span>
          </div>
        ) : (
          <p key={i} className="leading-snug">{line}</p>
        )
      ))}
    </div>
  )
}

interface ChatPanelProps {
  onPathHighlighted: (nodeIds: string[], edges: PathEdge[]) => void
}

const SUGGESTIONS = [
  'Which products have the most billing documents?',
  'Trace the full flow of billing document 90504248',
  'Find sales orders with incomplete flows',
  'How many deliveries were made in total?',
]

export default function ChatPanel({ onPathHighlighted }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Hi! I can help you analyze the Order to Cash process. Ask me anything about sales orders, deliveries, billing documents, or payments.',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [expandedSql, setExpandedSql] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = async (text?: string) => {
    const msg = (text || input).trim()
    if (!msg || loading) return
    setInput('')

    const userMsg: ChatMessage = { role: 'user', content: msg }
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)

    try {
      const result = await sendChat(msg, messages)
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: result.answer,
        sql_used: result.sql_used,
        nodes_referenced: result.nodes_referenced,
        edges_referenced: result.edges_referenced,
        rejected: result.rejected,
      }
      setMessages((prev) => [...prev, assistantMsg])
      if (result.nodes_referenced?.length) {
        onPathHighlighted(result.nodes_referenced, result.edges_referenced ?? [])
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong. Please try again.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-700">
      <div className="px-4 py-3 border-b border-slate-700">
        <div className="text-xs text-slate-400 uppercase tracking-wider">Chat with Graph</div>
        <div className="text-sm font-semibold text-white">Order to Cash</div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold mr-2 shrink-0 mt-0.5">
                D
              </div>
            )}
            <div className={`max-w-[80%] space-y-1`}>
              {msg.role === 'assistant' && (
                <div className="text-xs text-slate-400">Graph Agent</div>
              )}
              <div
                className={`rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-tr-sm'
                    : msg.rejected
                    ? 'bg-slate-700 text-amber-300 border border-amber-600/30'
                    : 'bg-slate-800 text-slate-100 border border-slate-700'
                }`}
              >
                {msg.rejected && (
                  <div className="flex items-center gap-1 mb-1">
                    <AlertCircle size={12} className="text-amber-400" />
                    <span className="text-xs text-amber-400">Out of scope</span>
                  </div>
                )}
                <MessageContent text={msg.content} />
              </div>

              {msg.sql_used && (
                <button
                  onClick={() => setExpandedSql(expandedSql === i ? null : i)}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {expandedSql === i ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  View SQL
                </button>
              )}
              {expandedSql === i && msg.sql_used && (
                <pre className="text-xs bg-slate-950 text-green-400 rounded-lg p-2 overflow-x-auto border border-slate-700 max-w-full">
                  {msg.sql_used}
                </pre>
              )}

              {msg.nodes_referenced && msg.nodes_referenced.length > 0 && (
                <div className="text-xs text-slate-500">
                  {msg.nodes_referenced.length} node{msg.nodes_referenced.length > 1 ? 's' : ''} highlighted
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold mr-2 shrink-0">
              D
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {messages.length <= 1 && (
        <div className="px-4 pb-2 space-y-1">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => handleSend(s)}
              className="w-full text-left text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg px-3 py-1.5 transition-colors border border-slate-700"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="px-4 py-3 border-t border-slate-700">
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Analyze anything..."
            disabled={loading}
            className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50 transition-colors"
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg p-2 transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-xs text-slate-500">
            {loading ? 'Thinking...' : 'Graph Agent is awaiting instructions'}
          </span>
        </div>
      </div>
    </div>
  )
}
