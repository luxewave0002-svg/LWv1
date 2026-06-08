'use client'

export const dynamic = 'force-dynamic'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
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

const DEPTH_COLORS = ['#D4A843', '#059669', '#d97706', '#db2777', '#2563eb']

function applyDagreLayout(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', ranksep: 70, nodesep: 30 })
  nodes.forEach((n) => g.setNode(n.id, { width: 160, height: 80 }))
  edges.forEach((e) => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return nodes.map((n) => {
    const pos = g.node(n.id)
    return { ...n, position: { x: pos.x - 80, y: pos.y - 40 } }
  })
}

type NodeData = { label: string; referralCode: string; depth: number; joinedAt: string | null }

function CustomNode({ data }: { data: NodeData }) {
  const color = DEPTH_COLORS[data.depth % DEPTH_COLORS.length]
  return (
    <div style={{ borderColor: color }} className="bg-lw-surface border-2 rounded-xl px-3 py-2 shadow-md min-w-[140px] text-center">
      <div className="text-lw-text-primary text-xs font-semibold truncate">{data.label}</div>
      <div style={{ color }} className="font-mono text-xs">{data.referralCode}</div>
    </div>
  )
}

const nodeTypes = { custom: CustomNode }

export default function AdminTreePage() {
  const { data: session } = useSession()
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [total, setTotal] = useState(0)
  const [searchId, setSearchId] = useState('')
  const [maxDepth, setMaxDepth] = useState(10)

  function loadTree(rootId?: string) {
    const id = rootId ?? session?.user?.id
    if (!id) return
    fetch(`/api/invite/tree?userId=${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.nodes) {
          const filtered = {
            nodes: data.nodes.filter((n: Node & { data: NodeData }) => n.data.depth <= maxDepth),
            edges: data.edges,
          }
          setNodes(applyDagreLayout(filtered.nodes, filtered.edges))
          setEdges(filtered.edges)
          setTotal(data.total)
        }
      })
  }

  useEffect(() => { loadTree() }, [session, maxDepth])

  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center gap-4 px-6 py-3 border-b border-lw-gold/10 bg-lw-void">
        <h1 className="text-lg font-display font-light text-lw-gold flex-shrink-0">全体ツリービュー</h1>
        <span className="text-lw-text-tertiary text-sm">総人数: {total}</span>
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-lw-text-secondary text-xs">深さ上限: {maxDepth}</label>
          <input
            type="range"
            min={1}
            max={30}
            value={maxDepth}
            onChange={(e) => setMaxDepth(Number(e.target.value))}
            className="w-24 accent-[#D4A843]"
          />
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="ユーザーIDで検索..."
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            className="bg-lw-surface border border-lw-gold/15 rounded-lg px-3 py-1.5 text-sm text-lw-text-primary placeholder:text-lw-text-tertiary focus:outline-none focus:border-lw-gold-muted transition-colors w-48"
          />
          <button
            onClick={() => loadTree(searchId || undefined)}
            className="bg-lw-gold hover:bg-lw-gold-mid text-lw-void px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            表示
          </button>
        </div>
      </div>
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          style={{ background: '#05060f' }}
        >
          <Background color="#141828" gap={20} />
          <Controls />
          <MiniMap nodeColor={(n) => DEPTH_COLORS[(n.data as NodeData).depth % DEPTH_COLORS.length]} style={{ background: '#141828' }} />
        </ReactFlow>
      </div>
    </div>
  )
}
