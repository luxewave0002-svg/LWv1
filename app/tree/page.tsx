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

// ─── Colors ───────────────────────────────────────────────

const BRANCH_COLORS = [
  { dark: '#1a3a5c', mid: '#2563eb', light: '#60a5fa', edge: '#3b82f6' }, // blue  – root
  { dark: '#4a2008', mid: '#c2410c', light: '#fb923c', edge: '#f97316' }, // orange
  { dark: '#14402a', mid: '#15803d', light: '#4ade80', edge: '#22c55e' }, // green
  { dark: '#2e1065', mid: '#7c3aed', light: '#c084fc', edge: '#a855f7' }, // purple
  { dark: '#4a0d26', mid: '#be185d', light: '#f472b6', edge: '#ec4899' }, // pink
  { dark: '#422006', mid: '#b45309', light: '#fbbf24', edge: '#eab308' }, // amber
]

function bc(branchIdx: number) {
  return BRANCH_COLORS[branchIdx % BRANCH_COLORS.length]
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

// ─── Node dimensions ──────────────────────────────────────

const CIRCLE_D = 80   // circle diameter
const NODE_W   = 130  // dagre bounding box width
const NODE_H   = 130  // circle (80) + gap (8) + label (~42)

function applyLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', ranksep: 72, nodesep: 32, marginx: 80, marginy: 80 })
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }))
  edges.forEach((e) => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return nodes.map((n) => {
    const p = g.node(n.id)
    return { ...n, position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 } }
  })
}

// ─── Types ────────────────────────────────────────────────

type ND = {
  label: string
  referralCode: string
  depth: number
  joinedAt: string | null
  isRoot: boolean
  directCount: number
  branchIndex: number
}

// ─── SVG person icon ──────────────────────────────────────

function PersonSVG({ sz }: { sz: number }) {
  return (
    <svg width={sz} height={sz} viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)">
      <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v1h20v-1c0-3.33-6.67-5-10-5z" />
    </svg>
  )
}

// ─── Circular org-chart node ──────────────────────────────

function OrgNode({ data, selected }: { data: ND; selected: boolean }) {
  const c = bc(data.branchIndex)

  return (
    <div
      className="flex flex-col items-center"
      style={{ width: NODE_W, userSelect: 'none', cursor: 'pointer' }}
    >
      {/* incoming edge connector */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: c.edge, border: 'none', width: 8, height: 8, top: 0 }}
      />

      {/* Circle */}
      <div
        style={{
          width: CIRCLE_D,
          height: CIRCLE_D,
          background: `radial-gradient(circle at 38% 36%, ${c.light}cc, ${c.mid})`,
          border: `3px solid ${selected ? 'rgba(255,255,255,0.8)' : c.light + '60'}`,
          boxShadow: selected
            ? `0 0 0 5px ${c.mid}50, 0 8px 32px ${c.mid}80`
            : `0 6px 24px ${c.mid}60, inset 0 1px 0 rgba(255,255,255,0.2)`,
          transition: 'box-shadow 0.2s, border-color 0.2s',
        }}
        className="rounded-full flex items-center justify-center flex-shrink-0"
      >
        <PersonSVG sz={data.isRoot ? 40 : 34} />
      </div>

      {/* outgoing edge connector — at bottom of circle */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: c.edge,
          border: 'none',
          width: 8,
          height: 8,
          bottom: 'auto',
          top: CIRCLE_D - 4,
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      />

      {/* Label */}
      <div className="mt-2 flex flex-col items-center text-center" style={{ width: NODE_W, gap: 2 }}>
        {data.isRoot && (
          <span
            style={{
              background: c.mid,
              color: '#fff',
              fontSize: 9,
              letterSpacing: '0.08em',
              lineHeight: 1,
            }}
            className="px-2 py-0.5 rounded-full font-bold uppercase"
          >
            YOU
          </span>
        )}
        <span
          className="font-bold text-white leading-tight"
          style={{ fontSize: 13, wordBreak: 'break-word', maxWidth: NODE_W }}
        >
          {data.label}
        </span>
        {data.directCount > 0 && (
          <span
            style={{ color: c.light, fontSize: 10 }}
            className="font-medium"
          >
            {data.directCount}名招待
          </span>
        )}
        {data.joinedAt && !data.isRoot && (
          <span style={{ color: 'rgba(156,163,175,0.7)', fontSize: 9 }}>
            {new Date(data.joinedAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
          </span>
        )}
      </div>
    </div>
  )
}

const nodeTypes = { org: OrgNode }

// ─── Detail Panel ─────────────────────────────────────────

function DetailPanel({ node, onClose }: { node: Node; onClose: () => void }) {
  const d = node.data as ND
  const c = bc(d.branchIndex)

  return (
    <div
      className="absolute right-4 top-4 z-10 w-60 rounded-2xl border overflow-hidden"
      style={{
        background: 'rgba(10,12,24,0.97)',
        borderColor: c.edge + '55',
        boxShadow: `0 0 40px ${c.mid}22, 0 10px 40px rgba(0,0,0,0.7)`,
        backdropFilter: 'blur(24px)',
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: c.edge + '28', background: c.dark }}
      >
        <div className="flex items-center gap-2.5">
          <div
            style={{ background: `linear-gradient(135deg, ${c.light}99, ${c.mid})` }}
            className="w-8 h-8 rounded-full flex items-center justify-center"
          >
            <PersonSVG sz={18} />
          </div>
          <span className="text-white font-semibold text-sm truncate">{d.label}</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-200 p-1 rounded-lg hover:bg-white/10 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="px-4 py-4 space-y-3">
        {([
          ['レベル', `L${d.depth}`],
          ['招待コード', d.referralCode],
          ...(d.joinedAt ? [['登録日', new Date(d.joinedAt).toLocaleDateString('ja-JP')]] : []),
          ...(d.directCount > 0 ? [['直接招待', `${d.directCount}名`]] : []),
        ] as [string, string][]).map(([lbl, val]) => (
          <div key={lbl} className="flex items-center justify-between gap-3">
            <span className="text-gray-500 text-xs shrink-0">{lbl}</span>
            <span style={{ color: c.light }} className="text-xs font-medium text-right break-all">{val}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Stats badge ──────────────────────────────────────────

function StatsBadge({ nodes, total }: { nodes: Node[]; total: number }) {
  const maxDepth = nodes.reduce((m, n) => Math.max(m, (n.data as ND).depth), 0)
  const direct   = nodes.filter((n) => (n.data as ND).depth === 1).length
  return (
    <div
      className="absolute left-4 top-4 z-10 rounded-2xl border px-4 py-3 space-y-2"
      style={{
        background: 'rgba(10,12,24,0.95)',
        borderColor: 'rgba(255,255,255,0.08)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(20px)',
      }}
    >
      <div className="text-gray-600 text-[9px] font-bold uppercase tracking-widest">Network</div>
      {([
        ['総メンバー', total,  '#f8fafc'],
        ['直接招待',   direct, '#4ade80'],
        ['最大深度',  `L${maxDepth}`, '#c084fc'],
      ] as [string, string | number, string][]).map(([lbl, val, col]) => (
        <div key={lbl} className="flex items-center justify-between gap-8">
          <span className="text-gray-500 text-[11px]">{lbl}</span>
          <span className="font-bold text-sm" style={{ color: col }}>{val}</span>
        </div>
      ))}
    </div>
  )
}

// ─── List view (mobile fallback) ──────────────────────────

function ListView({ nodes }: { nodes: Node[] }) {
  const byDepth = nodes.reduce<Record<number, ND[]>>((acc, n) => {
    const d = (n.data as ND).depth
    ;(acc[d] ??= []).push(n.data as ND)
    return acc
  }, {})

  return (
    <div className="space-y-3 px-4 pb-8">
      {Object.entries(byDepth).map(([depth, members]) => {
        const c = bc(Number(depth))
        return (
          <div key={depth} className="rounded-2xl border overflow-hidden" style={{ background: c.dark, borderColor: c.edge + '40' }}>
            <div className="px-4 py-2.5 flex items-center gap-2 border-b" style={{ borderColor: c.edge + '30' }}>
              <span style={{ background: c.mid, color: '#fff' }} className="text-xs font-bold px-2.5 py-0.5 rounded-full">L{depth}</span>
              <span className="text-white text-sm font-medium">{members.length}名</span>
            </div>
            <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              {members.map((m) => (
                <div key={m.referralCode} className="px-4 py-3 flex items-center gap-3">
                  <div
                    style={{ background: `radial-gradient(circle at 38% 36%, ${c.light}99, ${c.mid})` }}
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  >
                    <PersonSVG sz={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-semibold truncate">{m.label}</div>
                    <div style={{ color: c.light }} className="font-mono text-[10px] mt-0.5">{m.referralCode}</div>
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

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#080c18' }}>
      <div className="text-center space-y-4">
        <div className="relative w-14 h-14 mx-auto">
          <div className="absolute inset-0 rounded-full border-2 border-blue-500/20 animate-ping" style={{ animationDuration: '1.5s' }} />
          <div className="absolute inset-2 rounded-full border border-blue-500/40 animate-pulse" />
          <div className="absolute inset-[14px] rounded-full" style={{ background: BRANCH_COLORS[0].mid }} />
        </div>
        <div className="text-gray-500 text-xs tracking-widest uppercase">Loading...</div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────

function TreeView() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const targetUserId = searchParams.get('userId')

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [total, setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [view, setView]     = useState<'graph' | 'list'>('graph')
  const [sel, setSel]       = useState<Node | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    if (!session?.user?.id) return
    const uid = targetUserId ?? session.user.id
    setLoading(true)
    fetch(`/api/invite/tree?userId=${uid}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.nodes || !data.edges) return
        const rn = data.nodes as Node[]
        const re = data.edges as Edge[]
        const bmap = buildBranchMap(rn, re)

        const enriched = rn.map((n) => ({
          ...n,
          type: 'org',
          data: {
            ...n.data,
            isRoot:      n.data.depth === 0,
            directCount: re.filter((e) => e.source === n.id).length,
            branchIndex: bmap.get(n.id) ?? 0,
          },
        }))

        const styled = re.map((e) => {
          const c = bc(bmap.get(e.source) ?? 0)
          return {
            ...e,
            type: 'smoothstep',
            animated: false,
            style: { stroke: c.edge + 'a0', strokeWidth: 2.5 },
          }
        })

        setNodes(applyLayout(enriched, styled))
        setEdges(styled)
        setTotal(data.total)
      })
      .finally(() => setLoading(false))
  }, [session, targetUserId])

  const onNodeClick = useCallback<NodeMouseHandler>((_e, n) => {
    setSel((p) => (p?.id === n.id ? null : n))
  }, [])

  if (loading) return <Loading />

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
          {(['graph', 'list'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setView(m)}
              className={`px-3 py-1.5 text-xs font-medium transition-all ${view === m ? 'bg-violet-600 text-white' : 'text-gray-500 hover:text-white'}`}
            >
              {m === 'graph' ? 'グラフ' : 'リスト'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-6">
            <div
              style={{
                width: 80, height: 80,
                background: `radial-gradient(circle at 38% 36%, ${BRANCH_COLORS[0].light}99, ${BRANCH_COLORS[0].mid})`,
                boxShadow: `0 0 40px ${BRANCH_COLORS[0].mid}60`,
              }}
              className="rounded-full flex items-center justify-center"
            >
              <PersonSVG sz={40} />
            </div>
            <div className="space-y-1.5">
              <p className="text-gray-300 font-semibold">まだ招待したユーザーがいません</p>
              <p className="text-gray-600 text-sm">招待リンクを共有してネットワークを広げましょう</p>
            </div>
            <a href="/partner" className="text-white px-6 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 transition-colors">
              ダッシュボードへ
            </a>
          </div>
        ) : view === 'graph' ? (
          <>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              onNodeClick={onNodeClick}
              onPaneClick={() => setSel(null)}
              fitView
              fitViewOptions={{ padding: 0.25 }}
              minZoom={0.1}
              maxZoom={3}
              style={{ background: 'transparent' }}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} color="rgba(255,255,255,0.03)" gap={32} size={1} />
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
            {sel && <DetailPanel node={sel} onClose={() => setSel(null)} />}
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
    <Suspense fallback={<Loading />}>
      <TreeView />
    </Suspense>
  )
}
