'use client'

export const dynamic = 'force-dynamic'

import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useCallback, Suspense } from 'react'
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  Handle,
  Position,
  BackgroundVariant,
  NodeMouseHandler,
} from 'reactflow'
import 'reactflow/dist/style.css'
import dagre from '@dagrejs/dagre'

// ─── Branch colors (root=0, then per L1 branch) ───────────

const PALETTE = [
  { bg: '#1e3a5f', border: '#3b82f6', avatar: '#2563eb', text: '#93c5fd', edge: '#3b82f6' }, // blue  – root
  { bg: '#3b2010', border: '#f97316', avatar: '#ea580c', text: '#fdba74', edge: '#f97316' }, // orange
  { bg: '#134e32', border: '#22c55e', avatar: '#16a34a', text: '#86efac', edge: '#22c55e' }, // green
  { bg: '#2e1065', border: '#a855f7', avatar: '#7c3aed', text: '#d8b4fe', edge: '#a855f7' }, // purple
  { bg: '#4a1942', border: '#ec4899', avatar: '#db2777', text: '#f9a8d4', edge: '#ec4899' }, // pink
  { bg: '#422006', border: '#eab308', avatar: '#ca8a04', text: '#fde047', edge: '#eab308' }, // yellow
]

function pal(branchIdx: number) {
  return PALETTE[branchIdx % PALETTE.length]
}

function buildBranchMap(nodes: Node[], edges: Edge[]): Map<string, number> {
  const map = new Map<string, number>()
  const parentOf = new Map<string, string>()
  edges.forEach((e) => parentOf.set(e.target, e.source))

  const root = nodes.find((n) => n.data.depth === 0)
  if (!root) return map
  map.set(root.id, 0)

  const l1 = nodes.filter((n) => parentOf.get(n.id) === root.id)
  l1.forEach((n, i) => map.set(n.id, i + 1))

  const q = [...l1]
  while (q.length) {
    const node = q.shift()!
    const bi = map.get(node.id)!
    edges
      .filter((e) => e.source === node.id)
      .forEach((e) => {
        const child = nodes.find((n) => n.id === e.target)
        if (child && !map.has(child.id)) {
          map.set(child.id, bi)
          q.push(child)
        }
      })
  }
  return map
}

// ─── Layout ───────────────────────────────────────────────

const NW = 200
const NH = 56

function applyLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', ranksep: 56, nodesep: 20, marginx: 60, marginy: 60 })
  nodes.forEach((n) => g.setNode(n.id, { width: NW, height: NH }))
  edges.forEach((e) => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return nodes.map((n) => {
    const p = g.node(n.id)
    return { ...n, position: { x: p.x - NW / 2, y: p.y - NH / 2 } }
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
  branchIndex: number
}

// ─── Card Node ────────────────────────────────────────────

function CardNode({ data, selected }: { data: NodeData; selected: boolean }) {
  const c = pal(data.branchIndex)
  const initials = data.label.trim().slice(0, 2).toUpperCase()

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: c.border, border: 'none', width: 8, height: 8 }}
      />

      <div
        style={{
          width: NW,
          height: NH,
          background: c.bg,
          borderColor: selected ? c.border : c.border + '70',
          borderWidth: selected ? 2 : 1,
          boxShadow: selected
            ? `0 0 0 3px ${c.border}40, 0 4px 20px rgba(0,0,0,0.6)`
            : '0 2px 12px rgba(0,0,0,0.5)',
        }}
        className="border rounded-2xl flex items-center gap-3 px-3 select-none cursor-pointer transition-all duration-150"
      >
        {/* Avatar circle */}
        <div
          style={{ background: c.avatar, boxShadow: `0 0 10px ${c.border}60`, minWidth: 36, height: 36 }}
          className="rounded-full flex items-center justify-center"
        >
          <span className="text-white text-xs font-bold tracking-wide">{initials}</span>
        </div>

        {/* Name + level */}
        <div className="flex-1 min-w-0">
          <div className="text-white font-semibold text-sm truncate leading-tight">{data.label}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {data.isRoot && (
              <span
                style={{ background: c.border + '30', color: c.text }}
                className="text-[9px] font-bold px-1.5 py-px rounded-full uppercase tracking-wider"
              >
                YOU
              </span>
            )}
            <span style={{ color: c.text }} className="text-[10px] font-medium">
              L{data.depth}
            </span>
            {data.joinedAt && !data.isRoot && (
              <span className="text-gray-500 text-[10px]">
                {new Date(data.joinedAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
              </span>
            )}
          </div>
        </div>

        {/* Direct invite count badge */}
        {data.directCount > 0 && (
          <div
            style={{ background: c.border + '25', color: c.text, borderColor: c.border + '50' }}
            className="border rounded-full w-7 h-7 flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
          >
            {data.directCount}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: c.border, border: 'none', width: 8, height: 8 }}
      />
    </>
  )
}

const nodeTypes = { card: CardNode }

// ─── Detail Panel ─────────────────────────────────────────

function DetailPanel({ node, onClose }: { node: Node; onClose: () => void }) {
  const data = node.data as NodeData
  const c = pal(data.branchIndex)

  return (
    <div
      className="absolute right-4 top-4 z-10 w-64 rounded-2xl border overflow-hidden"
      style={{
        background: 'rgba(10,12,24,0.97)',
        borderColor: c.border + '60',
        boxShadow: `0 0 40px ${c.border}20, 0 10px 40px rgba(0,0,0,0.7)`,
        backdropFilter: 'blur(24px)',
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: c.border + '30', background: c.bg }}
      >
        <div className="flex items-center gap-2.5">
          <div
            style={{ background: c.avatar }}
            className="w-8 h-8 rounded-full flex items-center justify-center"
          >
            <span className="text-white text-xs font-bold">{data.label.slice(0, 2).toUpperCase()}</span>
          </div>
          <span className="text-white font-semibold text-sm truncate">{data.label}</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-200 transition-colors p-1 rounded-lg hover:bg-white/10"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="px-4 py-4 space-y-3">
        {([
          ['レベル', `L${data.depth}`],
          ['招待コード', data.referralCode],
          ...(data.joinedAt
            ? [['登録日', new Date(data.joinedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })]]
            : []),
          ...(data.directCount > 0 ? [['直接招待', `${data.directCount}名`]] : []),
        ] as [string, string][]).map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4">
            <span className="text-gray-500 text-xs shrink-0">{label}</span>
            <span style={{ color: c.text }} className="text-xs font-medium text-right break-all">
              {value}
            </span>
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
      className="absolute left-4 top-4 z-10 rounded-2xl border px-4 py-3 space-y-2.5"
      style={{
        background: 'rgba(10,12,24,0.95)',
        borderColor: 'rgba(255,255,255,0.08)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(20px)',
      }}
    >
      <div className="text-gray-600 text-[9px] font-bold uppercase tracking-widest">Network</div>
      {([
        ['総メンバー', total, '#f8fafc'],
        ['直接招待', directCount, '#4ade80'],
        ['最大深度', `L${maxDepth}`, '#c084fc'],
      ] as [string, string | number, string][]).map(([label, value, color]) => (
        <div key={label} className="flex items-center justify-between gap-8">
          <span className="text-gray-500 text-[11px]">{label}</span>
          <span className="font-bold text-sm" style={{ color }}>{value}</span>
        </div>
      ))}
    </div>
  )
}

// ─── List View ────────────────────────────────────────────

function ListView({ nodes }: { nodes: Node[] }) {
  const byDepth = nodes.reduce<Record<number, NodeData[]>>((acc, n) => {
    const d = (n.data as NodeData).depth
    ;(acc[d] ??= []).push(n.data as NodeData)
    return acc
  }, {})

  return (
    <div className="space-y-3 px-4 pb-8">
      {Object.entries(byDepth).map(([depth, members]) => {
        const c = pal(Number(depth))
        return (
          <div
            key={depth}
            className="rounded-2xl border overflow-hidden"
            style={{ background: c.bg, borderColor: c.border + '40' }}
          >
            <div
              className="px-4 py-2.5 flex items-center gap-2 border-b"
              style={{ borderColor: c.border + '30' }}
            >
              <span
                style={{ background: c.avatar, color: 'white' }}
                className="text-xs font-bold px-2.5 py-0.5 rounded-full"
              >
                L{depth}
              </span>
              <span className="text-white text-sm font-medium">{members.length}名</span>
            </div>
            <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              {members.map((m) => (
                <div key={m.referralCode} className="px-4 py-3 flex items-center gap-3">
                  <div
                    style={{ background: c.avatar }}
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  >
                    <span className="text-white text-[10px] font-bold">{m.label.slice(0, 2).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-medium truncate">{m.label}</div>
                    <div style={{ color: c.text }} className="font-mono text-[10px] mt-0.5">{m.referralCode}</div>
                  </div>
                  {m.joinedAt && (
                    <div className="text-gray-500 text-[10px] shrink-0">
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
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#080c18' }}>
      <div className="text-center space-y-4">
        <div className="relative w-14 h-14 mx-auto">
          <div className="absolute inset-0 rounded-full border-2 border-blue-500/20 animate-ping" style={{ animationDuration: '1.5s' }} />
          <div className="absolute inset-2 rounded-full border border-blue-500/40 animate-pulse" />
        </div>
        <div className="text-gray-500 text-xs tracking-widest uppercase">Loading...</div>
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
        if (!data.nodes || !data.edges) return
        const rawNodes = data.nodes as Node[]
        const rawEdges = data.edges as Edge[]
        const branchMap = buildBranchMap(rawNodes, rawEdges)

        const enriched = rawNodes.map((n) => ({
          ...n,
          type: 'card',
          data: {
            ...n.data,
            isRoot: n.data.depth === 0,
            directCount: rawEdges.filter((e) => e.source === n.id).length,
            branchIndex: branchMap.get(n.id) ?? 0,
          },
        }))

        const styledEdges = rawEdges.map((e) => {
          const bi = branchMap.get(e.source) ?? 0
          const c = pal(bi)
          return {
            ...e,
            type: 'smoothstep',
            animated: false,
            style: { stroke: c.border + '90', strokeWidth: 2 },
          }
        })

        const laid = applyLayout(enriched, styledEdges)
        setNodes(laid)
        setEdges(styledEdges)
        setTotal(data.total)
      })
      .finally(() => setLoading(false))
  }, [session, targetUserId])

  const onNodeClick = useCallback<NodeMouseHandler>((_e, node) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node))
  }, [])

  if (loading) return <LoadingScreen />

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#080c18' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 md:px-6 py-3 border-b"
        style={{ background: 'rgba(8,12,24,0.98)', borderColor: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)' }}
      >
        <div className="flex items-center gap-3">
          <a
            href="/partner"
            className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/5 transition-colors"
            style={{ border: '1px solid rgba(255,255,255,0.07)' }}
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
          style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
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
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: PALETTE[0].bg, border: `1px solid ${PALETTE[0].border}50` }}
            >
              <svg className="w-8 h-8" style={{ color: PALETTE[0].text }} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
            </div>
            <div className="space-y-1.5">
              <p className="text-gray-300 font-semibold">まだ招待したユーザーがいません</p>
              <p className="text-gray-600 text-sm">招待リンクを共有してネットワークを広げましょう</p>
            </div>
            <a
              href="/partner"
              className="text-white px-6 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 transition-colors"
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
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.1}
              maxZoom={3}
              style={{ background: 'transparent' }}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} color="rgba(255,255,255,0.03)" gap={28} size={1} />
              <Controls
                style={{
                  background: 'rgba(10,12,24,0.92)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 14,
                  backdropFilter: 'blur(12px)',
                }}
                showInteractive={false}
              />
            </ReactFlow>
            <StatsBadge nodes={nodes} total={total} />
            {selectedNode && (
              <DetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
            )}
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
