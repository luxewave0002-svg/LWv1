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
} from 'reactflow'
import 'reactflow/dist/style.css'
import dagre from '@dagrejs/dagre'

const DEPTH_COLORS = [
  '#7c3aed', // 紫
  '#059669', // 緑
  '#d97706', // オレンジ
  '#db2777', // ピンク
  '#2563eb', // 青
  '#7c3aed', // 繰り返し
]

function applyDagreLayout(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 40 })

  nodes.forEach((n) => g.setNode(n.id, { width: 180, height: 90 }))
  edges.forEach((e) => g.setEdge(e.source, e.target))
  dagre.layout(g)

  return nodes.map((n) => {
    const pos = g.node(n.id)
    return { ...n, position: { x: pos.x - 90, y: pos.y - 45 } }
  })
}

type NodeData = { label: string; referralCode: string; depth: number; joinedAt: string | null }

function CustomNode({ data }: { data: NodeData }) {
  const color = DEPTH_COLORS[data.depth % DEPTH_COLORS.length]
  return (
    <div
      style={{ borderColor: color }}
      className="bg-[#1a1a2e] border-2 rounded-xl px-4 py-3 shadow-lg min-w-[160px] text-center"
    >
      <div className="text-white font-semibold text-sm truncate">{data.label}</div>
      <div style={{ color }} className="font-mono text-xs mt-1">{data.referralCode}</div>
      {data.joinedAt && (
        <div className="text-gray-500 text-xs mt-0.5">
          {new Date(data.joinedAt).toLocaleDateString('ja-JP')}
        </div>
      )}
      <div
        style={{ backgroundColor: color + '33', color }}
        className="text-xs px-1.5 py-0.5 rounded-full mt-1 inline-block"
      >
        L{data.depth}
      </div>
    </div>
  )
}

const nodeTypes = { custom: CustomNode }

function TreeView() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const targetUserId = searchParams.get('userId')

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

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
          const laid = applyDagreLayout(data.nodes, data.edges)
          setNodes(laid)
          setEdges(data.edges)
          setTotal(data.total)
        }
      })
      .finally(() => setLoading(false))
  }, [session, targetUserId])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
        <div className="text-white animate-pulse">ツリーを読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0f0f1a] flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <h1 className="text-xl font-bold text-violet-400">招待ツリー</h1>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">総人数: <strong className="text-white">{total}</strong></span>
          <a href="/partner" className="text-gray-400 hover:text-white text-sm transition-colors">
            ← ダッシュボード
          </a>
        </div>
      </div>
      <div className="flex-1">
        {nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">まだ招待したユーザーがいません</p>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            style={{ background: '#0f0f1a' }}
          >
            <Background color="#1a1a2e" gap={20} />
            <Controls />
            <MiniMap
              nodeColor={(n) => DEPTH_COLORS[(n.data as NodeData).depth % DEPTH_COLORS.length]}
              style={{ background: '#1a1a2e' }}
            />
          </ReactFlow>
        )}
      </div>
    </div>
  )
}

export default function TreePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center text-white">読み込み中...</div>}>
      <TreeView />
    </Suspense>
  )
}
