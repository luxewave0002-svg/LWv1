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
  BackgroundVariant,
  NodeMouseHandler,
} from 'reactflow'
import 'reactflow/dist/style.css'
import dagre from '@dagrejs/dagre'

// ─── Colors ───────────────────────────────────────────────

const ROOT_COLOR = {
  circle: 'linear-gradient(145deg, #4a90d9, #2563a8)',
  glow: 'rgba(74,144,217,0.5)',
  edge: '#4a90d9',
  text: '#93c5fd',
}

const BRANCH_PALETTE = [
  { circle: 'linear-gradient(145deg, #c9973c, #8b6620)', glow: 'rgba(201,151,60,0.5)', edge: '#c9973c', text: '#fcd34d' },
  { circle: 'linear-gradient(145deg, #3a9a8c, #1f6b5e)', glow: 'rgba(58,154,140,0.5)', edge: '#3a9a8c', text: '#6ee7b7' },
  { circle: 'linear-gradient(145deg, #8b5cf6, #5b21b6)', glow: 'rgba(139,92,246,0.5)', edge: '#8b5cf6', text: '#c4b5fd' },
  { circle: 'linear-gradient(145deg, #ec4899, #9d174d)', glow: 'rgba(236,72,153,0.5)', edge: '#ec4899', text: '#f9a8d4' },
  { circle: 'linear-gradient(145deg, #f97316, #c2410c)', glow: 'rgba(249,115,22,0.5)', edge: '#f97316', text: '#fed7aa' },
]

function getBranchColor(branchIndex: number) {
  if (branchIndex === 0) return ROOT_COLOR
  return BRANCH_PALETTE[(branchIndex - 1) % BRANCH_PALETTE.length]
}

function buildBranchMap(nodes: Node[], edges: Edge[]): Map<string, number> {
  const map = new Map<string, number>()
  const parentMap = new Map<string, string>()
  edges.forEach((e) => parentMap.set(e.target, e.source))

  const root = nodes.find((n) => n.data.depth === 0)
  if (!root) return map
  map.set(root.id, 0)

  const l1 = nodes.filter((n) => parentMap.get(n.id) === root.id)
  l1.forEach((n, i) => map.set(n.id, i + 1))

  const queue = [...l1]
  while (queue.length > 0) {
    const node = queue.shift()!
    const branchIdx = map.get(node.id)!
    const children = edges
      .filter((e) => e.source === node.id)
      .map((e) => nodes.find((n) => n.id === e.target))
      .filter(Boolean) as Node[]
    children.forEach((child) => {
      map.set(child.id, branchIdx)
      queue.push(child)
    })
  }

  return map
}

// ─── Layout ───────────────────────────────────────────────

const NODE_W = 110
const NODE_H = 145
const CIRCLE = 88

function applyLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', ranksep: 60, nodesep: 36, marginx: 60, marginy: 60 })
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }))
  edges.forEach((e) => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return nodes.map((n) => {
    const p = g.node(n.id)
    return { ...n, position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 } }
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

// ─── Person Icon ──────────────────────────────────────────

function PersonIcon({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="white" style={{ opacity: 0.92 }}>
      <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v2h20v-2c0-3.33-6.67-5-10-5z" />
    </svg>
  )
}

// ─── Custom Node ──────────────────────────────────────────

function CustomNode({ data, selected }: { data: NodeData; selected: boolean }) {
  const c = getBranchColor(data.branchIndex)

  return (
    <div
      className="flex flex-col items-center"
      style={{ width: NODE_W, height: NODE_H, position: 'relative' }}
    >
      {/* Target handle — top of circle */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: c.edge,
          border: 'none',
          width: 6,
          height: 6,
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      />

      {/* Circle avatar */}
      <div
        style={{
          width: CIRCLE,
          height: CIRCLE,
          background: c.circle,
          boxShadow: selected
            ? `0 0 0 4px rgba(255,255,255,0.55), 0 0 0 8px ${c.glow}, 0 10px 30px ${c.glow}`
            : `0 6px 28px ${c.glow}, inset 0 1px 0 rgba(255,255,255,0.18)`,
          border: '2px solid rgba(255,255,255,0.12)',
          transition: 'box-shadow 0.2s',
          cursor: 'pointer',
        }}
        className="rounded-full flex items-center justify-center flex-shrink-0"
      >
        <PersonIcon size={data.isRoot ? 42 : 36} />
      </div>

      {/* Source handle — bottom of circle */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: c.edge,
          border: 'none',
          width: 6,
          height: 6,
          bottom: 'auto',
          top: CIRCLE - 3,
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      />

      {/* Label below circle */}
      <div className="mt-2 text-center px-1" style={{ width: NODE_W }}>
        {data.isRoot && (
          <div
            style={{ color: c.text, fontSize: 9 }}
            className="font-bold uppercase tracking-widest mb-0.5"
          >
            YOU
          </div>
        )}
        <div
          className="font-semibold text-white leading-snug"
          style={{ fontSize: 12, wordBreak: 'break-word' }}
        >
          {data.label}
        </div>
        {data.joinedAt && !data.isRoot && (
          <div style={{ color: c.text, fontSize: 9 }} className="mt-0.5 opacity-60">
            {new Date(data.joinedAt).toLocaleDateString('ja-JP', {
              month: 'numeric',
              day: 'numeric',
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const nodeTypes = { custom: CustomNode }

// ─── Detail Panel ─────────────────────────────────────────

function DetailPanel({ node, onClose }: { node: Node; onClose: () => void }) {
  const data = node.data as NodeData
  const c = getBranchColor(data.branchIndex)

  return (
    <div
      className="absolute right-4 top-4 z-10 w-60 rounded-2xl border overflow-hidden"
      style={{
        background: 'rgba(10,10,20,0.97)',
        borderColor: c.edge + '50',
        boxShadow: `0 0 40px ${c.glow}, 0 10px 40px rgba(0,0,0,0.7)`,
        backdropFilter: 'blur(24px)',
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: c.edge + '25', background: c.glow + '18' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            style={{ background: c.circle, boxShadow: `0 0 10px ${c.glow}` }}
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          >
            <PersonIcon size={18} />
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
        {([
          ['レベル', `L${data.depth}`],
          ['招待コード', data.referralCode],
          ...(data.joinedAt ? [['登録日', new Date(data.joinedAt).toLocaleDateString('ja-JP')]] : []),
          ...(data.directCount > 0 ? [['直接招待', `${data.directCount}名`]] : []),
        ] as [string, string][]).map(([label, value]) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-gray-500 text-xs">{label}</span>
            <span style={{ color: c.text }} className="text-xs font-medium">{value}</span>
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
        background: 'rgba(10,10,20,0.95)',
        borderColor: 'rgba(255,255,255,0.07)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(20px)',
      }}
    >
      <div className="text-gray-600 text-[9px] font-bold uppercase tracking-widest mb-2.5">
        Network
      </div>
      <div className="space-y-2">
        {([
          ['総メンバー', total, 'text-white'],
          ['直接招待', directCount, 'text-emerald-400'],
          ['最大深度', `L${maxDepth}`, 'text-violet-400'],
        ] as [string, string | number, string][]).map(([label, value, color]) => (
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
        const c = getBranchColor(Number(depth))
        return (
          <div
            key={depth}
            className="rounded-2xl border overflow-hidden"
            style={{ background: 'rgba(10,10,20,0.8)', borderColor: c.edge + '30' }}
          >
            <div
              className="px-4 py-2.5 flex items-center gap-2 border-b"
              style={{ borderColor: c.edge + '20', background: c.glow + '15' }}
            >
              <span
                style={{ background: c.circle, color: 'white', boxShadow: `0 0 8px ${c.glow}` }}
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
                    style={{ background: c.circle, boxShadow: `0 0 8px ${c.glow}` }}
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  >
                    <PersonIcon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-medium truncate">{m.label}</div>
                    <div style={{ color: c.text }} className="font-mono text-[10px] mt-0.5">
                      {m.referralCode}
                    </div>
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
            className="absolute inset-0 rounded-full border-2 border-blue-500/20 animate-ping"
            style={{ animationDuration: '1.5s' }}
          />
          <div className="absolute inset-2 rounded-full border border-blue-500/40 animate-pulse" />
          <div
            className="absolute inset-4 rounded-full"
            style={{ background: ROOT_COLOR.circle }}
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
          const rawNodes = data.nodes as Node[]
          const rawEdges = data.edges as Edge[]
          const branchMap = buildBranchMap(rawNodes, rawEdges)

          const enriched = rawNodes.map((n) => ({
            ...n,
            type: 'custom',
            data: {
              ...n.data,
              isRoot: n.data.depth === 0,
              directCount: rawEdges.filter((e) => e.source === n.id).length,
              branchIndex: branchMap.get(n.id) ?? 0,
            },
          }))

          const styledEdges = rawEdges.map((e) => {
            const branchIdx = branchMap.get(e.source) ?? 0
            const c = getBranchColor(branchIdx)
            return {
              ...e,
              type: 'smoothstep',
              animated: false,
              style: { stroke: c.edge + 'b0', strokeWidth: 2 },
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
            <svg
              className="w-4 h-4 text-gray-500"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
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
          style={{
            background: 'rgba(255,255,255,0.03)',
            borderColor: 'rgba(255,255,255,0.07)',
          }}
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
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{
                background: ROOT_COLOR.circle,
                boxShadow: `0 0 50px ${ROOT_COLOR.glow}`,
              }}
            >
              <PersonIcon size={42} />
            </div>
            <div className="space-y-1.5">
              <p className="text-gray-300 font-semibold">まだ招待したユーザーがいません</p>
              <p className="text-gray-600 text-sm">招待リンクを共有してネットワークを広げましょう</p>
            </div>
            <a
              href="/partner"
              className="text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-105"
              style={{
                background: ROOT_COLOR.circle,
                boxShadow: `0 0 20px ${ROOT_COLOR.glow}`,
              }}
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
              <Background
                variant={BackgroundVariant.Dots}
                color="rgba(255,255,255,0.03)"
                gap={32}
                size={1}
              />
              <Controls
                style={{
                  background: 'rgba(10,10,20,0.92)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 14,
                  backdropFilter: 'blur(12px)',
                }}
                showInteractive={false}
              />
              <MiniMap
                nodeColor={(n) => getBranchColor((n.data as NodeData).branchIndex).edge}
                maskColor="rgba(0,0,0,0.75)"
                style={{
                  background: 'rgba(10,10,20,0.92)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 14,
                }}
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
