'use client'

export const dynamic = 'force-dynamic'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type InviteLog = {
  id: string
  inviteCode: string
  invitedAt: string
  joinedAt: string | null
  invitee: { name: string | null } | null
}

export default function InvitePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [invites, setInvites] = useState<InviteLog[]>([])
  const [generating, setGenerating] = useState(false)
  const [newCode, setNewCode] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    if (session) {
      fetch('/api/invite/list')
        .then((r) => r.json())
        .then((data) => Array.isArray(data) && setInvites(data))
    }
  }, [session])

  async function generateCode() {
    setGenerating(true)
    const res = await fetch('/api/invite/generate', { method: 'POST' })
    const data = await res.json()
    setNewCode(data.url)
    setInvites((prev) => [
      { id: data.code, inviteCode: data.code, invitedAt: new Date().toISOString(), joinedAt: null, invitee: null },
      ...prev,
    ])
    setGenerating(false)
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? ''

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-violet-400">招待コード管理</h1>
          <a href="/partner" className="text-gray-400 hover:text-white text-sm transition-colors">
            ← ダッシュボードへ
          </a>
        </div>

        {/* 新規発行 */}
        <div className="bg-[#1a1a2e] rounded-2xl p-6 border border-white/10">
          <h2 className="text-lg font-semibold text-gray-300 mb-4">新しい招待コードを発行</h2>
          <button
            onClick={generateCode}
            disabled={generating}
            className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
          >
            {generating ? '発行中...' : '招待コードを発行する'}
          </button>
          {newCode && (
            <div className="mt-4 bg-[#0f0f1a] border border-violet-500/50 rounded-lg p-4">
              <p className="text-xs text-gray-400 mb-1">新しい招待URL</p>
              <p className="font-mono text-violet-300 break-all text-sm">{newCode}</p>
              <div className="flex gap-3 mt-3">
                <button
                  onClick={() => navigator.clipboard.writeText(newCode)}
                  className="text-xs bg-violet-900/50 hover:bg-violet-900 border border-violet-700 text-violet-300 px-3 py-1.5 rounded-lg transition-colors"
                >
                  コピー
                </button>
                <a
                  href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(newCode)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs bg-sky-900/50 hover:bg-sky-900 border border-sky-700 text-sky-300 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Xでシェア
                </a>
                <a
                  href={`https://line.me/R/msg/text/?${encodeURIComponent(newCode)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs bg-green-900/50 hover:bg-green-900 border border-green-700 text-green-300 px-3 py-1.5 rounded-lg transition-colors"
                >
                  LINEでシェア
                </a>
              </div>
            </div>
          )}
        </div>

        {/* 発行済み一覧 */}
        <div className="bg-[#1a1a2e] rounded-2xl p-6 border border-white/10">
          <h2 className="text-lg font-semibold text-gray-300 mb-4">
            発行済みコード一覧 <span className="text-gray-500 text-sm font-normal">({invites.length}件)</span>
          </h2>
          {invites.length === 0 ? (
            <p className="text-gray-500 text-sm">まだ招待コードがありません</p>
          ) : (
            <div className="space-y-2">
              {invites.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between bg-[#0f0f1a] rounded-lg px-4 py-3 border border-white/5"
                >
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-violet-400 text-sm">{log.inviteCode}</span>
                    <span className="text-gray-500 text-xs">
                      {new Date(log.invitedAt).toLocaleDateString('ja-JP')} 発行
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {log.joinedAt ? (
                      <span className="bg-emerald-900/50 text-emerald-400 text-xs px-2 py-0.5 rounded-full border border-emerald-700">
                        {log.invitee?.name ?? '匿名'} 登録済
                      </span>
                    ) : (
                      <span className="bg-yellow-900/50 text-yellow-400 text-xs px-2 py-0.5 rounded-full border border-yellow-700">
                        未使用
                      </span>
                    )}
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(`${baseUrl}/?ref=${log.inviteCode}`)
                      }
                      className="text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      コピー
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
