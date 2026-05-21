'use client'

export const dynamic = 'force-dynamic'

import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  Handle,
  Position,
  MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'
import dagre from '@dagrejs/dagre'

// ─── Constants ────────────────────────────────────────────

const DEPTH_COLORS = [
  { border: '#7c3aed', bg: '#7c3aed18', text: '#a78bfa', badge: '#4c1d95' },
  { border: '#059669', bg: '#05966918', text: '#34d399', badge: '#064e3b' },
  { border: '#d97706', bg: '#d9770618', text: '#fbbf24', badge: '#78350f' },
  { border: '#db2777', bg: '#db277718', text: '#f472b6', badge: '#831843' },
  { border: '#2563eb', bg: '#2563eb18', text: '#60a5fa', badge: '#1e3a8a' },
]

function depthColor(depth: number) {
  return DEPTH_COLORS[depth % DEPTH_COLORS.length]
}

// ─── Dagre layout ─────────────────────────────────────────

function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', ranksep: 100, nodesep: 60, marginx: 40, marginy: 40 })

  nodes.forEach((n) => g.setNode(n.id, { width: 200, height: 80 }))
  edges.forEach((e) => g.setEdge(e.source, e.target))
  dagre.layout(g)

  return nodes.map((n) => {
    const pos = g.node(n.id)
    return { ...n, position: { x: pos.x - 100, y: pos.y - 40 } }
  })
}

// ─── Custom Node ──────────────────────────────────────────

type NodeData = {
  label: string
  referralCode: string
  depth: number
  joinedAt: string | null
  isRoot: boolean
}

function CustomNode({ data }: { data: NodeData }) {
  const c = depthColor(data.depth)
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ background: c.border, border: 'none', width: 8, height: 8 }} />
      <div
        style={{ borderColor: c.border, background: '#1a1a2e' }}
        className="border-2 rounded-2xl px-4 py-3 shadow-xl w-[200px] select-none"
      >
        {data.isRoot && (
          <div
            style={{ background: c.badge, color: c.text }}
            className="text-[10px] font-bold px-2 py-0.5 rounded-full mb-2 inline-block uppercase tracking-wider"
          >
            あなた
          </div>
        )}
        <div className="text-white font-semibold text-sm truncate">{data.label}</div>
        <div style={{ color: c.text }} className="font-mono text-xs mt-0.5 truncate">{data.referralCode}</div>
        <div className="flex items-center justify-between mt-2">
          <div
            style={{ background: c.badge, color: c.text }}
            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
          >
            L{data.depth}
          </div>
          {data.joinedAt && (
            <div className="text-gray-500 text-[10px]">
              {new Date(data.joinedAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
            </div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: c.border, border: 'none', width: 8, height: 8 }} />
    </>
  )
}

const nodeTypes = { custom: CustomNode }

// ─── List View (mobile fallback) ──────────────────────────

function ListView({ nodes }: { nodes: Node[] }) {
  const byDepth = nodes.reduce<Record<number, NodeData[]>>((acc, n) => {
    const d = (n.data as NodeData).depth
    if (!acc[d]) acc[d] = []
    acc[d].push(n.data as NodeData)
    return acc
  }, {})

  return (
    <div className="space-y-4 px-4 pb-8">
      {Object.entries(byDepth).map(([depth, members]) => {
        const c = depthColor(Number(depth))
        return (
          <div key={depth} className="bg-[#1a1a2e] rounded-2xl border overflow-hidden" style={{ borderColor: c.border + '40' }}>
            <div className="px-4 py-2.5 flex items-center gap-2 border-b" style={{ borderColor: c.border + '30', background: c.bg }}>
              <div style={{ background: c.badge, color: c.text }} className="text-xs font-bold px-2.5 py-0.5 rounded-full">L{depth}</div>
              <span className="text-white text-sm font-medium">{members.length}名</span>
            </div>
            <div className="divide-y divide-white/5">
              {members.map((m) => (
                <div key={m.referralCode} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-white text-sm font-medium">{m.label}</div>
                    <div style={{ color: c.text }} className="font-mono text-xs mt-0.5">{m.referralCode}</div>
                  </div>
                  {m.joinedAt && (
                    <div className="text-gray-500 text-xs">
                      {new Date(m.joinedAt).toLocaleDateString('ja-JP')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Stats bar ────────────────────────────────────────────

function StatsBar({ nodes, total }: { nodes: Node[]; total: number }) {
  const maxDepth = nodes.reduce((m, n) => Math.max(m, (n.data as NodeData).depth), 0)
  const depthCounts = nodes.reduce<Record<number, number>>((acc, n) => {
    const d = (n.data as NodeData).depth
    acc[d] = (acc[d] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-white/10 bg-[#0a0a14] text-xs overflow-x-auto">
      <span className="text-gray-400 whitespace-nowrap">総人数: <strong className="text-white">{total}</strong></span>
      <span className="text-gray-600">|</span>
      <span className="text-gray-400 whitespace-nowrap">最大深度: <strong className="text-white">{maxDepth}</strong></span>
      <span className="text-gray-600">|</span>
      {Object.entries(depthCounts).map(([d, count]) => {
        const c = depthColor(Number(d))
        return (
          <span key={d} style={{ color: c.text }} className="whitespace-nowrap">
            L{d}: {count}名
          </span>
        )
      })}
    </div>
  )
}

// ─── Main tree view ───────────────────────────────────────

function TreeView() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const targetUserId = searchParams.get('userId')

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    if (!session?.user?.id) return
    const userId = targetUserId ?? session.user.id
    setLoading(true)

    fetch(`/api/invite/tree?userId=${userId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.nodes && data.edges) {
          // Mark root node
          const nodesWithRoot = data.nodes.map((n: Node) => ({
            ...n,
            data: { ...n.data, isRoot: n.data.depth === 0 },
          }))
          // Style edges
          const styledEdges = data.edges.map((e: Edge) => ({
            ...e,
            type: 'smoothstep',
            animated: false,
            style: { stroke: '#4c1d95', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed', width: 16, height: 16 },
          }))
          const laid = applyDagreLayout(nodesWithRoot, styledEdges)
          setNodes(laid)
          setEdges(styledEdges)
          setTotal(data.total)
        }
      })
      .finally(() => setLoading(false))
  }, [session, targetUserId])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
        <div className="text-white animate-pulse text-sm">ツリーを読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0f0f1a] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-white/10 bg-[#0a0a14]">
        <div className="flex items-center gap-3">
          <a href="/partner" className="text-gray-500 hover:text-gray-300 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </a>
          <h1 className="text-lg font-bold text-white">招待ツリー</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-[#1a1a2e] rounded-lg overflow-hidden border border-white/10">
            <button
              onClick={() => setViewMode('graph')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'graph' ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              グラフ
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              リスト
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      {nodes.length > 0 && <StatsBar nodes={nodes} total={total} />}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
            <div className="w-16 h-16 rounded-full bg-[#1a1a2e] border border-white/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
            </div>
            <div>
              <p className="text-gray-300 font-medium">まだ招待したユーザーがいません</p>
              <p className="text-gray-500 text-sm mt-1">招待リンクを共有してみましょう</p>
            </div>
            <a href="/partner" className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors">
              ダッシュボードへ
            </a>
          </div>
        ) : viewMode === 'graph' ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={2}
            style={{ background: '#0f0f1a' }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#ffffff08" gap={24} size={1} />
            <Controls
              style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}
              showInteractive={false}
            />
            <MiniMap
              nodeColor={(n) => depthColor((n.data as NodeData).depth).border}
              maskColor="rgba(0,0,0,0.6)"
              style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}
            />
          </ReactFlow>
        ) : (
          <div className="h-full overflow-y-auto pt-4">
            <ListView nodes={nodes} />
          </div>
        )}
      </div>
    </div>
  )
}

export default function TreePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
        <div className="text-white text-sm animate-pulse">読み込み中...</div>
      </div>
    }>
      <TreeView />
    </Suspense>
  )
}
