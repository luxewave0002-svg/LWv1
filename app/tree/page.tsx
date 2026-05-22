'use client'

export const dynamic = 'force-dynamic'

import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useCallback, Suspense } from 'react'
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
  BackgroundVariant,
  NodeMouseHandler,
} from 'reactflow'
import 'reactflow/dist/style.css'
import dagre from '@dagrejs/dagre'

// ─── Colors ───────────────────────────────────────────────

const DEPTH_COLORS = [
  { border: '#8b5cf6', glow: '#7c3aed', bg: 'rgba(139,92,246,0.08)', text: '#c4b5fd', badge: '#3b0764', avatar: '#6d28d9' },
  { border: '#10b981', glow: '#059669', bg: 'rgba(16,185,129,0.08)', text: '#6ee7b7', badge: '#052e16', avatar: '#047857' },
  { border: '#f59e0b', glow: '#d97706', bg: 'rgba(245,158,11,0.08)', text: '#fcd34d', badge: '#451a03', avatar: '#b45309' },
  { border: '#ec4899', glow: '#db2777', bg: 'rgba(236,72,153,0.08)', text: '#f9a8d4', badge: '#4a0520', avatar: '#be185d' },
  { border: '#3b82f6', glow: '#2563eb', bg: 'rgba(59,130,246,0.08)', text: '#93c5fd', badge: '#172554', avatar: '#1d4ed8' },
]

function dc(depth: number) {
  return DEPTH_COLORS[depth % DEPTH_COLORS.length]
}

function getInitials(name: string) {
  return name.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '?'
}

// ─── Layout ───────────────────────────────────────────────

function applyLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', ranksep: 160, nodesep: 80, marginx: 80, marginy: 80 })
  nodes.forEach((n) => g.setNode(n.id, { width: 220, height: 90 }))
  edges.forEach((e) => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return nodes.map((n) => {
    const p = g.node(n.id)
    return { ...n, position: { x: p.x - 110, y: p.y - 45 } }
  })
}

// ─── Types ────────────────────────────────────────────────

type NodeData = {
  label: string
  referralCode: string
  depth: number
  joinedAt: string | null
  isRoot: boolean
  directCount: number
}

// ─── Custom Node ──────────────────────────────────────────

function CustomNode({ data, selected }: { data: NodeData; selected: boolean }) {
  const c = dc(data.depth)
  const ini = getInitials(data.label)

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: c.border, border: 'none', width: 10, height: 10, left: -5 }}
      />
      <div
        style={{
          background: selected ? 'rgba(22,22,42,0.98)' : 'rgba(14,14,26,0.92)',
          borderColor: selected ? c.border : c.border + '60',
          borderWidth: selected ? 2 : 1,
          boxShadow: selected
            ? `0 0 0 3px ${c.glow}25, 0 0 32px ${c.glow}35, inset 0 1px 0 rgba(255,255,255,0.06)`
            : `0 0 18px ${c.glow}18, 0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)`,
          backdropFilter: 'blur(20px)',
        }}
        className="border rounded-2xl p-3 w-[220px] select-none transition-all duration-150 cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div
            style={{
              background: `linear-gradient(135deg, ${c.glow}dd, ${c.avatar})`,
              boxShadow: `0 0 14px ${c.glow}55`,
            }}
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          >
            <span className="text-white text-xs font-bold tracking-wide">{ini}</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              {data.isRoot && (
                <span
                  style={{ background: c.badge, color: c.text, boxShadow: `0 0 8px ${c.glow}40` }}
                  className="text-[9px] font-bold px-1.5 py-px rounded-full uppercase tracking-widest flex-shrink-0"
                >
                  YOU
                </span>
              )}
              <span className="text-white font-semibold text-sm truncate leading-none">{data.label}</span>
            </div>
            <div className="flex items-center justify-between">
              <span
                style={{ background: c.bg, color: c.text, borderColor: c.border + '40' }}
                className="text-[9px] font-mono px-1.5 py-px rounded-full border"
              >
                L{data.depth}
              </span>
              {data.joinedAt && (
                <span className="text-gray-600 text-[9px]">
                  {new Date(data.joinedAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
                </span>
              )}
            </div>
          </div>
        </div>

        {data.directCount > 0 && (
          <div
            style={{ color: c.text, borderColor: c.border + '30', background: c.bg }}
            className="mt-2.5 border rounded-xl py-1 px-2 text-[9px] text-center font-medium tracking-wide"
          >
            {data.directCount} 名招待済み
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: c.border, border: 'none', width: 10, height: 10, right: -5 }}
      />
    </>
  )
}

const nodeTypes = { custom: CustomNode }

// ─── Detail Panel ─────────────────────────────────────────

function DetailPanel({ node, onClose }: { node: Node; onClose: () => void }) {
  const data = node.data as NodeData
  const c = dc(data.depth)
  const ini = getInitials(data.label)

  return (
    <div
      className="absolute right-4 top-4 z-10 w-64 rounded-2xl border overflow-hidden"
      style={{
        background: 'rgba(14,14,26,0.97)',
        borderColor: c.border + '50',
        boxShadow: `0 0 40px ${c.glow}18, 0 8px 40px rgba(0,0,0,0.7)`,
        backdropFilter: 'blur(24px)',
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: c.border + '25', background: c.bg }}
      >
        <div className="flex items-center gap-2.5">
          <div
            style={{
              background: `linear-gradient(135deg, ${c.glow}dd, ${c.avatar})`,
              boxShadow: `0 0 10px ${c.glow}50`,
            }}
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          >
            <span className="text-white text-xs font-bold">{ini}</span>
          </div>
          <span className="text-white font-semibold text-sm truncate">{data.label}</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-600 hover:text-gray-300 transition-colors p-1 rounded-lg hover:bg-white/10"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="px-4 py-4 space-y-3">
        {[
          { label: 'レベル', value: <span style={{ background: c.badge, color: c.text }} className="text-xs font-bold px-2 py-0.5 rounded-full">L{data.depth}</span> },
          { label: '招待コード', value: <span style={{ color: c.text }} className="font-mono text-xs">{data.referralCode}</span> },
          ...(data.joinedAt ? [{ label: '登録日', value: <span className="text-white text-xs">{new Date(data.joinedAt).toLocaleDateString('ja-JP')}</span> }] : []),
          ...(data.directCount > 0 ? [{ label: '直接招待', value: <span className="text-white text-xs font-semibold">{data.directCount}名</span> }] : []),
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-gray-500 text-xs">{label}</span>
            {value}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Stats Badge ──────────────────────────────────────────

function StatsBadge({ nodes, total }: { nodes: Node[]; total: number }) {
  const maxDepth = nodes.reduce((m, n) => Math.max(m, (n.data as NodeData).depth), 0)
  const directCount = nodes.filter((n) => (n.data as NodeData).depth === 1).length

  return (
    <div
      className="absolute left-4 top-4 z-10 rounded-2xl border px-4 py-3"
      style={{
        background: 'rgba(14,14,26,0.95)',
        borderColor: 'rgba(255,255,255,0.07)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(20px)',
      }}
    >
      <div className="text-gray-600 text-[9px] font-bold uppercase tracking-widest mb-2.5">Network</div>
      <div className="space-y-2">
        {[
          { label: '総メンバー', value: total, color: 'text-white' },
          { label: '直接招待', value: directCount, color: 'text-emerald-400' },
          { label: '最大深度', value: `L${maxDepth}`, color: 'text-violet-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex items-center justify-between gap-8">
            <span className="text-gray-500 text-[11px]">{label}</span>
            <span className={`font-bold text-sm ${color}`}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── List View ────────────────────────────────────────────

function ListView({ nodes }: { nodes: Node[] }) {
  const byDepth = nodes.reduce<Record<number, NodeData[]>>((acc, n) => {
    const d = (n.data as NodeData).depth
    if (!acc[d]) acc[d] = []
    acc[d].push(n.data as NodeData)
    return acc
  }, {})

  return (
    <div className="space-y-3 px-4 pb-8">
      {Object.entries(byDepth).map(([depth, members]) => {
        const c = dc(Number(depth))
        return (
          <div
            key={depth}
            className="rounded-2xl border overflow-hidden"
            style={{ background: 'rgba(14,14,26,0.8)', borderColor: c.border + '30' }}
          >
            <div
              className="px-4 py-2.5 flex items-center gap-2 border-b"
              style={{ borderColor: c.border + '20', background: c.bg }}
            >
              <span
                style={{ background: c.badge, color: c.text, boxShadow: `0 0 8px ${c.glow}40` }}
                className="text-xs font-bold px-2.5 py-0.5 rounded-full"
              >
                L{depth}
              </span>
              <span className="text-white text-sm font-medium">{members.length}名</span>
            </div>
            <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
              {members.map((m) => (
                <div key={m.referralCode} className="px-4 py-3 flex items-center gap-3">
                  <div
                    style={{ background: `linear-gradient(135deg, ${c.glow}cc, ${c.avatar})` }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  >
                    <span className="text-white text-[10px] font-bold">{getInitials(m.label)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-medium truncate">{m.label}</div>
                    <div style={{ color: c.text }} className="font-mono text-[10px] mt-0.5">{m.referralCode}</div>
                  </div>
                  {m.joinedAt && (
                    <div className="text-gray-600 text-[10px] flex-shrink-0">
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

// ─── Loading ──────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#08080f' }}>
      <div className="text-center space-y-5">
        <div className="relative w-16 h-16 mx-auto">
          <div
            className="absolute inset-0 rounded-full border-2 border-violet-500/20 animate-ping"
            style={{ animationDuration: '1.5s' }}
          />
          <div className="absolute inset-2 rounded-full border border-violet-500/40 animate-pulse" />
          <div
            className="absolute inset-4 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.5), rgba(109,40,217,0.2))' }}
          />
        </div>
        <div className="text-gray-500 text-xs tracking-widest uppercase">Loading network...</div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────

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
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)

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
          const enriched = (data.nodes as Node[]).map((n) => ({
            ...n,
            type: 'custom',
            data: {
              ...n.data,
              isRoot: n.data.depth === 0,
              directCount: (data.edges as Edge[]).filter((e) => e.source === n.id).length,
            },
          }))
          const styledEdges = (data.edges as Edge[]).map((e) => {
            const src = (data.nodes as Node[]).find((n) => n.id === e.source)
            const c = dc(src?.data?.depth ?? 0)
            return {
              ...e,
              type: 'smoothstep',
              animated: true,
              style: { stroke: c.border + '80', strokeWidth: 1.5 },
              markerEnd: { type: MarkerType.ArrowClosed, color: c.border, width: 12, height: 12 },
            }
          })
          const laid = applyLayout(enriched, styledEdges)
          setNodes(laid)
          setEdges(styledEdges)
          setTotal(data.total)
        }
      })
      .finally(() => setLoading(false))
  }, [session, targetUserId])

  const onNodeClick = useCallback<NodeMouseHandler>((_evt, node) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node))
  }, [])

  if (loading) return <LoadingScreen />

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#08080f' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 md:px-6 py-3 border-b"
        style={{
          background: 'rgba(8,8,15,0.98)',
          borderColor: 'rgba(255,255,255,0.05)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <div className="flex items-center gap-3">
          <a
            href="/partner"
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors hover:bg-white/5"
            style={{ border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </a>
          <div>
            <h1 className="text-white font-bold text-sm leading-none">招待ネットワーク</h1>
            <p className="text-gray-600 text-[10px] mt-0.5 tracking-wider">INVITE NETWORK</p>
          </div>
        </div>

        <div
          className="flex rounded-xl overflow-hidden border"
          style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)' }}
        >
          {(['graph', 'list'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 text-xs font-medium transition-all ${
                viewMode === mode ? 'bg-violet-600 text-white' : 'text-gray-500 hover:text-white'
              }`}
            >
              {mode === 'graph' ? 'グラフ' : 'リスト'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-6">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center"
              style={{
                background: 'rgba(139,92,246,0.08)',
                border: '1px solid rgba(139,92,246,0.2)',
                boxShadow: '0 0 50px rgba(139,92,246,0.12)',
              }}
            >
              <svg className="w-10 h-10 text-violet-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
            </div>
            <div className="space-y-1.5">
              <p className="text-gray-300 font-semibold">まだ招待したユーザーがいません</p>
              <p className="text-gray-600 text-sm">招待リンクを共有してネットワークを広げましょう</p>
            </div>
            <a
              href="/partner"
              className="text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-105"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', boxShadow: '0 0 20px rgba(124,58,237,0.4)' }}
            >
              ダッシュボードへ
            </a>
          </div>
        ) : viewMode === 'graph' ? (
          <>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              onNodeClick={onNodeClick}
              onPaneClick={() => setSelectedNode(null)}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.1}
              maxZoom={3}
              style={{ background: 'transparent' }}
              proOptions={{ hideAttribution: true }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                color="rgba(255,255,255,0.035)"
                gap={32}
                size={1}
              />
              <Controls
                style={{
                  background: 'rgba(14,14,26,0.92)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 14,
                  backdropFilter: 'blur(12px)',
                  bottom: 80,
                }}
                showInteractive={false}
              />
              <MiniMap
                nodeColor={(n) => dc((n.data as NodeData).depth).border}
                maskColor="rgba(0,0,0,0.75)"
                style={{
                  background: 'rgba(14,14,26,0.92)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 14,
                  backdropFilter: 'blur(12px)',
                }}
              />
            </ReactFlow>
            <StatsBadge nodes={nodes} total={total} />
            {selectedNode && <DetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />}
          </>
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
    <Suspense fallback={<LoadingScreen />}>
      <TreeView />
    </Suspense>
  )
}
