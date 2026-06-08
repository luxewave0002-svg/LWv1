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

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_BASE_URL ?? '')

  return (
    <div className="min-h-screen bg-lw-void text-lw-text-primary p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-display font-light text-lw-gold">招待コード管理</h1>
          <a href="/partner" className="text-lw-text-secondary hover:text-lw-text-primary text-sm transition-colors">
            ← ダッシュボードへ
          </a>
        </div>

        {/* 新規発行 */}
        <div className="bg-lw-surface rounded-2xl p-6 border border-lw-gold/10">
          <h2 className="text-sm font-medium text-lw-text-secondary mb-4 tracking-[0.04em]">新しい招待コードを発行</h2>
          <button
            onClick={generateCode}
            disabled={generating}
            className="bg-lw-gold hover:bg-lw-gold-mid disabled:opacity-50 text-lw-void px-6 py-2.5 rounded-lg font-medium transition-colors"
          >
            {generating ? '発行中...' : '招待コードを発行する'}
          </button>
          {newCode && (
            <div className="mt-4 bg-lw-raised border border-lw-gold/40 rounded-lg p-4">
              <p className="text-xs text-lw-text-tertiary mb-1 tracking-[0.06em] uppercase">新しい招待URL</p>
              <p className="font-mono text-lw-gold break-all text-sm">{newCode}</p>
              <div className="flex gap-3 mt-3">
                <button
                  onClick={() => navigator.clipboard.writeText(newCode)}
                  className="text-xs bg-lw-gold-muted/30 hover:bg-lw-gold-muted/50 border border-lw-gold-muted text-lw-gold px-3 py-1.5 rounded-lg transition-colors"
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
                  href={`https://line.me/R/msg/text/?${encodeURIComponent(`LUXE WAVEへの招待リンクです\n${newCode}`)}`}
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
        <div className="bg-lw-surface rounded-2xl p-6 border border-lw-gold/10">
          <h2 className="text-sm font-medium text-lw-text-secondary mb-4 tracking-[0.04em]">
            発行済みコード一覧{' '}
            <span className="text-lw-text-tertiary font-normal">({invites.length}件)</span>
          </h2>
          {invites.length === 0 ? (
            <p className="text-lw-text-tertiary text-sm">まだ招待コードがありません</p>
          ) : (
            <div className="space-y-2">
              {invites.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between bg-lw-raised rounded-lg px-4 py-3 border border-lw-gold/5"
                >
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-lw-gold text-sm">{log.inviteCode}</span>
                    <span className="text-lw-text-tertiary text-xs">
                      {new Date(log.invitedAt).toLocaleDateString('ja-JP')} 発行
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {log.joinedAt ? (
                      <span className="bg-lw-teal-muted/40 text-lw-teal text-xs px-2 py-0.5 rounded-full border border-lw-teal-mid/50">
                        {log.invitee?.name ?? '匿名'} 登録済
                      </span>
                    ) : (
                      <span className="bg-lw-gold-muted/30 text-lw-gold text-xs px-2 py-0.5 rounded-full border border-lw-gold-muted">
                        未使用
                      </span>
                    )}
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(`${baseUrl}/?ref=${log.inviteCode}`)
                      }
                      className="text-xs text-lw-text-tertiary hover:text-lw-text-primary transition-colors"
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
