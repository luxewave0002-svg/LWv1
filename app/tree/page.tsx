'use client'

export const dynamic = 'force-dynamic'

import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useRef, Suspense } from 'react'

// ─── Colors ───────────────────────────────────────────────

const COLORS = [
  { mid: '#2563eb', light: '#93c5fd', dark: '#1e3a5f', edge: '#3b82f6' }, // blue  root
  { mid: '#c2410c', light: '#fdba74', dark: '#431407', edge: '#f97316' }, // orange
  { mid: '#15803d', light: '#86efac', dark: '#14532d', edge: '#22c55e' }, // green
  { mid: '#7c3aed', light: '#d8b4fe', dark: '#2e1065', edge: '#a855f7' }, // purple
  { mid: '#be185d', light: '#f9a8d4', dark: '#500724', edge: '#ec4899' }, // pink
  { mid: '#b45309', light: '#fde68a', dark: '#451a03', edge: '#eab308' }, // amber
]
const col = (bi: number) => COLORS[bi % COLORS.length]

// ─── Types ────────────────────────────────────────────────

type RawNode = { id: string; data: { label: string; referralCode: string; depth: number; joinedAt: string | null } }
type RawEdge = { source: string; target: string }

type TNode = {
  id: string
  label: string
  referralCode: string
  depth: number
  joinedAt: string | null
  isRoot: boolean
  directCount: number
  branchIndex: number
  children: TNode[]
  x: number
  y: number
}

// ─── Build tree ───────────────────────────────────────────

function buildTree(rawNodes: RawNode[], rawEdges: RawEdge[]): TNode | null {
  const childrenOf = new Map<string, string[]>()
  rawNodes.forEach((n) => childrenOf.set(n.id, []))
  rawEdges.forEach((e) => childrenOf.get(e.source)?.push(e.target))

  const childIds = new Set(rawEdges.map((e) => e.target))
  const root = rawNodes.find((n) => !childIds.has(n.id))
  if (!root) return null

  // branch color map
  const bmap = new Map<string, number>()
  bmap.set(root.id, 0)
  const l1 = (childrenOf.get(root.id) ?? [])
  l1.forEach((id, i) => bmap.set(id, i + 1))
  const q = [...l1]
  while (q.length) {
    const id = q.shift()!
    const bi = bmap.get(id)!
    ;(childrenOf.get(id) ?? []).forEach((cid) => {
      if (!bmap.has(cid)) { bmap.set(cid, bi); q.push(cid) }
    })
  }

  function make(n: RawNode): TNode {
    const kids = (childrenOf.get(n.id) ?? [])
      .map((cid) => rawNodes.find((x) => x.id === cid)!)
      .filter(Boolean)
      .map(make)
    return {
      id: n.id,
      ...n.data,
      isRoot: n.data.depth === 0,
      directCount: kids.length,
      branchIndex: bmap.get(n.id) ?? 0,
      children: kids,
      x: 0,
      y: 0,
    }
  }
  return make(root)
}

// ─── Layout (Reingold-Tilford style) ─────────────────────

const R   = 46   // circle radius
const LH  = 170  // level height (center to center)
const SEP = 120  // min horizontal separation

function layoutTree(root: TNode): void {
  // Assign y by depth
  const assignY = (n: TNode, d: number) => {
    n.y = d * LH + R + 20
    n.children.forEach((c) => assignY(c, d + 1))
  }
  assignY(root, 0)

  // Assign x using a leaf counter
  let leaf = 0
  const assignX = (n: TNode) => {
    if (!n.children.length) { n.x = leaf++ * SEP; return }
    n.children.forEach(assignX)
    n.x = (n.children[0].x + n.children[n.children.length - 1].x) / 2
  }
  assignX(root)
}

function flatten(n: TNode): TNode[] {
  return [n, ...n.children.flatMap(flatten)]
}

// ─── SVG edge path (curved) ───────────────────────────────

function edgePath(from: TNode, to: TNode): string {
  const x1 = from.x, y1 = from.y + R
  const x2 = to.x,   y2 = to.y - R
  const mid = (y1 + y2) / 2
  return `M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`
}

// ─── SVG Org-Chart ────────────────────────────────────────

function OrgChart({ root, total }: { root: TNode; total: number }) {
  const [sel, setSel] = useState<TNode | null>(null)

  // pan / zoom
  const [vb, setVb] = useState({ x: 0, y: 0, w: 1, h: 1 })
  const drag = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const nodes = flatten(root)

  // calculate viewBox to fit all nodes on mount
  useEffect(() => {
    const xs = nodes.map((n) => n.x)
    const ys = nodes.map((n) => n.y)
    const pad = 100
    const x = Math.min(...xs) - R - pad
    const y = Math.min(...ys) - R - pad
    const w = Math.max(...xs) - Math.min(...xs) + 2 * R + 2 * pad
    const h = Math.max(...ys) - Math.min(...ys) + 2 * R + 2 * pad + 60
    setVb({ x, y, w, h })
  }, [root.id])

  // collect edges
  const edges: { from: TNode; to: TNode }[] = []
  const collectEdges = (n: TNode) => {
    n.children.forEach((c) => { edges.push({ from: n, to: c }); collectEdges(c) })
  }
  collectEdges(root)

  // wheel zoom
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 1.12 : 0.88
    setVb((v) => ({
      x: v.x + (v.w * (1 - factor)) / 2,
      y: v.y + (v.h * (1 - factor)) / 2,
      w: v.w * factor,
      h: v.h * factor,
    }))
  }

  const onMouseDown = (e: React.MouseEvent) => {
    drag.current = { sx: e.clientX, sy: e.clientY, vx: vb.x, vy: vb.y }
  }
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag.current || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const scaleX = vb.w / rect.width
    const scaleY = vb.h / rect.height
    const dx = (e.clientX - drag.current.sx) * scaleX
    const dy = (e.clientY - drag.current.sy) * scaleY
    setVb((v) => ({ ...v, x: drag.current!.vx - dx, y: drag.current!.vy - dy }))
  }
  const onMouseUp = () => { drag.current = null }

  const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0)
  const direct   = nodes.filter((n) => n.depth === 1).length

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        style={{ display: 'block', cursor: drag.current ? 'grabbing' : 'grab', userSelect: 'none' }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {/* Edges */}
        {edges.map((e, i) => {
          const c = col(e.to.branchIndex)
          return (
            <path
              key={i}
              d={edgePath(e.from, e.to)}
              fill="none"
              stroke={c.edge}
              strokeWidth={2.5}
              strokeOpacity={0.65}
              strokeLinecap="round"
            />
          )
        })}

        {/* Nodes */}
        {nodes.map((n) => {
          const c   = col(n.branchIndex)
          const isSel = sel?.id === n.id
          const lblMaxLen = 11
          const lbl = n.label.length > lblMaxLen ? n.label.slice(0, lblMaxLen - 1) + '…' : n.label

          return (
            <g
              key={n.id}
              onClick={() => setSel(isSel ? null : n)}
              style={{ cursor: 'pointer' }}
            >
              {/* Glow ring when selected */}
              {isSel && (
                <circle cx={n.x} cy={n.y} r={R + 7}
                  fill="none" stroke={c.edge} strokeWidth={2.5} strokeOpacity={0.55} />
              )}

              {/* Shadow */}
              <circle cx={n.x} cy={n.y + 5} r={R}
                fill="rgba(0,0,0,0.35)" />

              {/* Main circle */}
              <circle cx={n.x} cy={n.y} r={R}
                fill={c.mid}
                stroke={isSel ? 'rgba(255,255,255,0.85)' : c.light}
                strokeWidth={isSel ? 3 : 2}
                strokeOpacity={isSel ? 1 : 0.4}
              />

              {/* Highlight (shine) */}
              <ellipse cx={n.x - R * 0.28} cy={n.y - R * 0.3} rx={R * 0.45} ry={R * 0.3}
                fill={c.light} fillOpacity={0.22} />

              {/* Person — head */}
              <circle cx={n.x} cy={n.y - 11} r={10}
                fill="rgba(255,255,255,0.92)" />

              {/* Person — body */}
              <path
                d={`M${n.x - 17},${n.y + 20} Q${n.x - 17},${n.y + 4} ${n.x},${n.y + 4} Q${n.x + 17},${n.y + 4} ${n.x + 17},${n.y + 20}`}
                fill="rgba(255,255,255,0.92)"
              />

              {/* YOU badge */}
              {n.isRoot && (
                <g>
                  <rect x={n.x - 18} y={n.y - R - 22} width={36} height={16} rx={8}
                    fill={c.mid} />
                  <text x={n.x} y={n.y - R - 9}
                    textAnchor="middle" fontSize={9} fontWeight="800"
                    fill="white" fontFamily="system-ui" letterSpacing="1.5">
                    YOU
                  </text>
                </g>
              )}

              {/* Name */}
              <text
                x={n.x} y={n.y + R + 20}
                textAnchor="middle" fontSize={13} fontWeight="700"
                fill="white" fontFamily="system-ui, -apple-system, sans-serif"
              >
                {lbl}
              </text>

              {/* Level + invite count */}
              <text
                x={n.x} y={n.y + R + 37}
                textAnchor="middle" fontSize={10} fill={c.light}
                fontFamily="system-ui" fillOpacity={0.85}
              >
                {`L${n.depth}${n.directCount > 0 ? `  ·  ${n.directCount}名` : ''}`}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Stats */}
      <div style={{
        position: 'absolute', left: 16, top: 16, zIndex: 10,
        background: 'rgba(10,12,24,0.95)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16,
        padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#4b5563', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Network</div>
        {([['総メンバー', total, '#f8fafc'], ['直接招待', direct, '#4ade80'], ['最大深度', `L${maxDepth}`, '#c084fc']] as [string, string|number, string][]).map(([l, v, c]) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 32 }}>
            <span style={{ fontSize: 11, color: '#6b7280' }}>{l}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: c }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Detail panel */}
      {sel && (
        <div style={{
          position: 'absolute', right: 16, top: 16, zIndex: 10,
          width: 240, borderRadius: 20, overflow: 'hidden',
          background: 'rgba(10,12,24,0.97)', backdropFilter: 'blur(24px)',
          border: `1px solid ${col(sel.branchIndex).edge}55`,
          boxShadow: `0 0 40px ${col(sel.branchIndex).mid}22, 0 10px 40px rgba(0,0,0,0.7)`,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: `1px solid ${col(sel.branchIndex).edge}28`,
            background: col(sel.branchIndex).dark,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: col(sel.branchIndex).mid,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
              </div>
              <span style={{ color: '#fff', fontWeight: 600, fontSize: 14, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {sel.label}
              </span>
            </div>
            <button onClick={() => setSel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4 }}>
              <svg width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {([
              ['レベル', `L${sel.depth}`],
              ['招待コード', sel.referralCode],
              ...(sel.joinedAt ? [['登録日', new Date(sel.joinedAt).toLocaleDateString('ja-JP')]] : []),
              ...(sel.directCount > 0 ? [['直接招待', `${sel.directCount}名`]] : []),
            ] as [string, string][]).map(([lbl, val]) => (
              <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span style={{ color: '#6b7280', fontSize: 12, flexShrink: 0 }}>{lbl}</span>
                <span style={{ color: col(sel.branchIndex).light, fontSize: 12, fontWeight: 500, textAlign: 'right', wordBreak: 'break-all' }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hint */}
      <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.06em' }}>
          ドラッグで移動　/　スクロールで拡大縮小
        </span>
      </div>
    </div>
  )
}

// ─── List view ────────────────────────────────────────────

function ListView({ root }: { root: TNode }) {
  const byDepth: Record<number, TNode[]> = {}
  flatten(root).forEach((n) => {
    ;(byDepth[n.depth] ??= []).push(n)
  })

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
              <div key={m.id} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: c.mid, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</div>
                  <div style={{ color: c.light, fontSize: 10, fontFamily: 'monospace', marginTop: 2 }}>{m.referralCode}</div>
                </div>
                {m.joinedAt && (
                  <div style={{ color: '#6b7280', fontSize: 10, flexShrink: 0 }}>
                    {new Date(m.joinedAt).toLocaleDateString('ja-JP')}
                  </div>
                )}
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
        <div style={{ width: 56, height: 56, margin: '0 auto 16px', borderRadius: '50%', border: '3px solid rgba(37,99,235,0.3)', borderTopColor: '#3b82f6', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
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

  const [root, setRoot]       = useState<TNode | null>(null)
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [view, setView]       = useState<'graph' | 'list'>('graph')

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
        const tree = buildTree(data.nodes as RawNode[], data.edges as RawEdge[])
        if (tree) {
          layoutTree(tree)
          setRoot(tree)
          setTotal(data.total)
        }
      })
      .finally(() => setLoading(false))
  }, [session, targetUserId])

  if (loading) return <Loading />

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#080c18' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(8,12,24,0.98)' }}>
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
            }}>
              {m === 'graph' ? 'グラフ' : 'リスト'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', minHeight: 0 }}>
        {!root ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 20, padding: '0 24px', textAlign: 'center' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: COLORS[0].mid, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width={40} height={40} viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
            </div>
            <div>
              <p style={{ color: '#d1d5db', fontWeight: 600, marginBottom: 6 }}>まだ招待したユーザーがいません</p>
              <p style={{ color: '#6b7280', fontSize: 14 }}>招待リンクを共有してネットワークを広げましょう</p>
            </div>
            <a href="/partner" style={{ background: '#7c3aed', color: '#fff', padding: '10px 24px', borderRadius: 12, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>
              ダッシュボードへ
            </a>
          </div>
        ) : view === 'graph' ? (
          <OrgChart root={root} total={total} />
        ) : (
          <div style={{ height: '100%', overflowY: 'auto', paddingTop: 16 }}>
            <ListView root={root} />
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
