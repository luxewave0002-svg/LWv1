'use client'

export const dynamic = 'force-dynamic'

import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
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
  ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'
import dagre from '@dagrejs/dagre'

// ─── Colors ───────────────────────────────────────────────

const COLORS = [
  { dark: '#1a3a5c', mid: '#2563eb', light: '#93c5fd', edge: '#3b82f6' },
  { dark: '#4a2008', mid: '#c2410c', light: '#fdba74', edge: '#f97316' },
  { dark: '#14402a', mid: '#15803d', light: '#86efac', edge: '#22c55e' },
  { dark: '#2e1065', mid: '#7c3aed', light: '#d8b4fe', edge: '#a855f7' },
  { dark: '#4a0d26', mid: '#be185d', light: '#f9a8d4', edge: '#ec4899' },
  { dark: '#422006', mid: '#b45309', light: '#fde68a', edge: '#eab308' },
]

const col = (bi: number) => COLORS[bi % COLORS.length]

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
    edges.filter((e) => e.source === node.id).forEach((e) => {
      const child = nodes.find((n) => n.id === e.target)
      if (child && !map.has(child.id)) { map.set(child.id, bi); q.push(child) }
    })
  }
  return map
}

// ─── Layout ───────────────────────────────────────────────

const NW = 130
const NH = 150

function layout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', ranksep: 60, nodesep: 28, marginx: 80, marginy: 80 })
  nodes.forEach((n) => g.setNode(n.id, { width: NW, height: NH }))
  edges.forEach((e) => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return nodes.map((n) => {
    const p = g.node(n.id)
    return { ...n, position: { x: p.x - NW / 2, y: p.y - NH / 2 } }
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

// ─── Circle node ──────────────────────────────────────────

function CircleNode({ data, selected }: { data: ND; selected: boolean }) {
  const c = col(data.branchIndex)
  return (
    <div style={{ width: NW, height: NH, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

      <Handle type="target" position={Position.Top}
        style={{ background: c.edge, border: 'none', width: 8, height: 8, top: 0 }} />

      {/* Circle */}
      <div style={{
        marginTop: 4,
        width: 84,
        height: 84,
        borderRadius: '50%',
        background: `radial-gradient(circle at 36% 34%, ${c.light}bb, ${c.mid})`,
        border: `3px solid ${selected ? 'rgba(255,255,255,0.85)' : c.light + '55'}`,
        boxShadow: selected
          ? `0 0 0 5px ${c.mid}50, 0 8px 28px ${c.mid}70`
          : `0 6px 24px ${c.mid}60`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        cursor: 'pointer',
        transition: 'box-shadow .2s, border-color .2s',
      }}>
        {/* person icon */}
        <svg width={data.isRoot ? 42 : 36} height={data.isRoot ? 42 : 36} viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)">
          <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v1h20v-1c0-3.33-6.67-5-10-5z" />
        </svg>
      </div>

      {/* Labels */}
      <div style={{ marginTop: 8, textAlign: 'center', width: NW, paddingLeft: 4, paddingRight: 4 }}>
        {data.isRoot && (
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: c.light, textTransform: 'uppercase', marginBottom: 2 }}>
            YOU
          </div>
        )}
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {data.label}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 3 }}>
          <span style={{ fontSize: 10, color: c.light, fontWeight: 600 }}>L{data.depth}</span>
          {data.directCount > 0 && (
            <span style={{ fontSize: 10, color: c.light }}>· {data.directCount}名</span>
          )}
        </div>
        {data.joinedAt && !data.isRoot && (
          <div style={{ fontSize: 9, color: 'rgba(156,163,175,0.65)', marginTop: 2 }}>
            {new Date(data.joinedAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom}
        style={{ background: c.edge, border: 'none', width: 8, height: 8, bottom: 0 }} />
    </div>
  )
}

const nodeTypes = { circle: CircleNode }

// ─── Detail panel ─────────────────────────────────────────

function DetailPanel({ node, onClose }: { node: Node; onClose: () => void }) {
  const d = node.data as ND
  const c = col(d.branchIndex)
  return (
    <div style={{
      position: 'absolute', right: 16, top: 16, zIndex: 10,
      width: 240, borderRadius: 20,
      background: 'rgba(10,12,24,0.97)',
      border: `1px solid ${c.edge}55`,
      boxShadow: `0 0 40px ${c.mid}20, 0 10px 40px rgba(0,0,0,0.7)`,
      backdropFilter: 'blur(24px)',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${c.edge}28`, background: c.dark }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg, ${c.light}99, ${c.mid})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)">
              <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v1h20v-1c0-3.33-6.67-5-10-5z" />
            </svg>
          </div>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{d.label}</span>
        </div>
        <button onClick={onClose} style={{ color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          <svg width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {([
          ['レベル', `L${d.depth}`],
          ['招待コード', d.referralCode],
          ...(d.joinedAt ? [['登録日', new Date(d.joinedAt).toLocaleDateString('ja-JP')]] : []),
          ...(d.directCount > 0 ? [['直接招待', `${d.directCount}名`]] : []),
        ] as [string, string][]).map(([lbl, val]) => (
          <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ color: '#6b7280', fontSize: 12 }}>{lbl}</span>
            <span style={{ color: c.light, fontSize: 12, fontWeight: 500, wordBreak: 'break-all', textAlign: 'right' }}>{val}</span>
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
    <div style={{
      position: 'absolute', left: 16, top: 16, zIndex: 10,
      borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)',
      background: 'rgba(10,12,24,0.95)', backdropFilter: 'blur(20px)',
      padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#4b5563', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Network</div>
      {([['総メンバー', total, '#f8fafc'], ['直接招待', direct, '#4ade80'], ['最大深度', `L${maxDepth}`, '#c084fc']] as [string, string|number, string][]).map(([l, v, c]) => (
        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 32 }}>
          <span style={{ fontSize: 11, color: '#6b7280' }}>{l}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: c }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

// ─── List view ────────────────────────────────────────────

function ListView({ nodes }: { nodes: Node[] }) {
  const byDepth = nodes.reduce<Record<number, ND[]>>((acc, n) => {
    const d = (n.data as ND).depth;
    (acc[d] ??= []).push(n.data as ND)
    return acc
  }, {})
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 16px 32px' }}>
      {Object.entries(byDepth).map(([depth, members]) => {
        const c = col(Number(depth))
        return (
          <div key={depth} style={{ borderRadius: 16, border: `1px solid ${c.edge}40`, background: c.dark, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${c.edge}30` }}>
              <span style={{ background: c.mid, color: '#fff', fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 99 }}>L{depth}</span>
              <span style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{members.length}名</span>
            </div>
            {members.map((m) => (
              <div key={m.referralCode} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: `radial-gradient(circle at 36% 34%, ${c.light}99, ${c.mid})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)">
                    <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v1h20v-1c0-3.33-6.67-5-10-5z" />
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</div>
                  <div style={{ color: c.light, fontSize: 10, fontFamily: 'monospace', marginTop: 2 }}>{m.referralCode}</div>
                </div>
                {m.joinedAt && <div style={{ color: '#6b7280', fontSize: 10, flexShrink: 0 }}>{new Date(m.joinedAt).toLocaleDateString('ja-JP')}</div>}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ─── Loading ──────────────────────────────────────────────

function Loading() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#080c18' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ position: 'relative', width: 56, height: 56, margin: '0 auto 16px' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(37,99,235,0.2)', animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite' }} />
          <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', border: '1px solid rgba(37,99,235,0.4)' }} />
          <div style={{ position: 'absolute', inset: 16, borderRadius: '50%', background: COLORS[0].mid }} />
        </div>
        <div style={{ color: '#6b7280', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Loading...</div>
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
  const rfRef = useRef<ReactFlowInstance | null>(null)

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [view, setView]       = useState<'graph' | 'list'>('graph')
  const [sel, setSel]         = useState<Node | null>(null)

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
          type: 'circle',
          data: {
            ...n.data,
            isRoot:      n.data.depth === 0,
            directCount: re.filter((e) => e.source === n.id).length,
            branchIndex: bmap.get(n.id) ?? 0,
          },
        }))

        const styled = re.map((e) => {
          const c = col(bmap.get(e.source) ?? 0)
          return { ...e, type: 'smoothstep', animated: false, style: { stroke: c.edge + 'a0', strokeWidth: 2.5 } }
        })

        setNodes(layout(enriched, styled))
        setEdges(styled)
        setTotal(data.total)

        // fit after render
        setTimeout(() => rfRef.current?.fitView({ padding: 0.25 }), 120)
      })
      .finally(() => setLoading(false))
  }, [session, targetUserId])

  const onNodeClick = useCallback<NodeMouseHandler>((_e, n) => {
    setSel((p) => (p?.id === n.id ? null : n))
  }, [])

  if (loading) return <Loading />

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#080c18' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(8,12,24,0.98)', backdropFilter: 'blur(20px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/partner" style={{ width: 32, height: 32, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.07)', color: '#6b7280', textDecoration: 'none' }}>
            <svg width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </a>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, lineHeight: 1 }}>招待ネットワーク</div>
            <div style={{ color: '#4b5563', fontSize: 10, marginTop: 3, letterSpacing: '0.08em' }}>INVITE NETWORK</div>
          </div>
        </div>
        <div style={{ display: 'flex', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
          {(['graph', 'list'] as const).map((m) => (
            <button key={m} onClick={() => setView(m)} style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none',
              background: view === m ? '#7c3aed' : 'rgba(255,255,255,0.03)',
              color: view === m ? '#fff' : '#6b7280',
              transition: 'background .15s, color .15s',
            }}>
              {m === 'graph' ? 'グラフ' : 'リスト'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {nodes.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 20, padding: '0 24px', textAlign: 'center' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: `radial-gradient(circle at 36% 34%, ${COLORS[0].light}99, ${COLORS[0].mid})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 40px ${COLORS[0].mid}60` }}>
              <svg width={40} height={40} viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)">
                <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v1h20v-1c0-3.33-6.67-5-10-5z" />
              </svg>
            </div>
            <div>
              <p style={{ color: '#d1d5db', fontWeight: 600, marginBottom: 6 }}>まだ招待したユーザーがいません</p>
              <p style={{ color: '#6b7280', fontSize: 14 }}>招待リンクを共有してネットワークを広げましょう</p>
            </div>
            <a href="/partner" style={{ background: '#7c3aed', color: '#fff', padding: '10px 24px', borderRadius: 12, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>ダッシュボードへ</a>
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
              onInit={(instance) => { rfRef.current = instance }}
              minZoom={0.1}
              maxZoom={3}
              style={{ background: 'transparent', width: '100%', height: '100%' }}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} color="rgba(255,255,255,0.03)" gap={32} size={1} />
              <Controls
                style={{ background: 'rgba(10,12,24,0.92)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, backdropFilter: 'blur(12px)' }}
                showInteractive={false}
              />
            </ReactFlow>
            <StatsBadge nodes={nodes} total={total} />
            {sel && <DetailPanel node={sel} onClose={() => setSel(null)} />}
          </>
        ) : (
          <div style={{ height: '100%', overflowY: 'auto', paddingTop: 16 }}>
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
