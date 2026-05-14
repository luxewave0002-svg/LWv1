'use client'

export const dynamic = 'force-dynamic'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import QRCode from 'qrcode'

type InviteLog = {
  id: string
  inviteCode: string
  invitedAt: string
  joinedAt: string | null
  invitee: { name: string | null; email: string | null } | null
}

type Stats = {
  directCount: number
  totalCount: number
  inviteLogs: InviteLog[]
  referralCode: string
}

export default function PartnerPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    if (session?.user?.id) {
      fetch('/api/partner/stats')
        .then((r) => r.json())
        .then(setStats)
    }
  }, [session])

  useEffect(() => {
    if (stats?.referralCode) {
      const url = `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/?ref=${stats.referralCode}`
      QRCode.toDataURL(url, { width: 180, margin: 1 }).then(setQrDataUrl)
    }
  }, [stats])

  if (status === 'loading' || !stats) {
    return (
      <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
        <div className="text-white text-lg animate-pulse">読み込み中...</div>
      </div>
    )
  }

  const inviteUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/?ref=${stats.referralCode}`

  function copyUrl() {
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-violet-400">パートナーダッシュボード</h1>

        {/* 招待URL カード */}
        <div className="bg-[#1a1a2e] rounded-2xl p-6 border border-white/10">
          <h2 className="text-lg font-semibold text-gray-300 mb-4">あなたの招待リンク</h2>
          <div className="flex gap-4 items-start">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 uppercase tracking-wider">招待コード</span>
                <span className="bg-violet-900/50 text-violet-300 font-mono px-3 py-1 rounded-full text-sm border border-violet-700">
                  {stats.referralCode}
                </span>
              </div>
              <div className="bg-[#0f0f1a] border border-white/10 rounded-lg px-4 py-3 font-mono text-sm text-gray-300 break-all">
                {inviteUrl}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={copyUrl}
                  className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {copied ? '✓ コピー済み' : 'URLをコピー'}
                </button>
                <a
                  href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(inviteUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Xでシェア
                </a>
                <a
                  href={`https://line.me/R/msg/text/?${encodeURIComponent(inviteUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  LINEでシェア
                </a>
              </div>
            </div>
            {qrDataUrl && (
              <div className="flex-shrink-0 bg-white p-2 rounded-xl">
                <img src={qrDataUrl} alt="QRコード" width={160} height={160} />
              </div>
            )}
          </div>
        </div>

        {/* 統計カード */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[#1a1a2e] rounded-2xl p-6 border border-white/10 text-center">
            <div className="text-4xl font-bold text-violet-400">{stats.directCount}</div>
            <div className="text-gray-400 mt-1">直接招待数</div>
          </div>
          <div className="bg-[#1a1a2e] rounded-2xl p-6 border border-white/10 text-center">
            <div className="text-4xl font-bold text-emerald-400">{stats.totalCount}</div>
            <div className="text-gray-400 mt-1">総配下人数</div>
          </div>
        </div>

        {/* ツリーへのリンク */}
        <a
          href={`/tree?userId=${session?.user?.id}`}
          className="block bg-gradient-to-r from-violet-900/50 to-indigo-900/50 hover:from-violet-900/70 hover:to-indigo-900/70 border border-violet-700/50 rounded-2xl p-5 text-center transition-all"
        >
          <span className="text-violet-300 font-semibold text-lg">招待ツリーを見る →</span>
        </a>

        {/* 招待リスト */}
        <div className="bg-[#1a1a2e] rounded-2xl p-6 border border-white/10">
          <h2 className="text-lg font-semibold text-gray-300 mb-4">招待した人一覧</h2>
          {stats.inviteLogs.length === 0 ? (
            <p className="text-gray-500 text-sm">まだ誰も招待していません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-gray-400">
                    <th className="text-left py-2 pr-4">名前</th>
                    <th className="text-left py-2 pr-4">招待コード</th>
                    <th className="text-left py-2 pr-4">招待日時</th>
                    <th className="text-left py-2 pr-4">登録日時</th>
                    <th className="text-left py-2">状態</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.inviteLogs.map((log) => (
                    <tr key={log.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-2 pr-4 text-white">
                        {log.invitee?.name ?? '未登録'}
                      </td>
                      <td className="py-2 pr-4 font-mono text-violet-400">{log.inviteCode}</td>
                      <td className="py-2 pr-4 text-gray-400">
                        {new Date(log.invitedAt).toLocaleDateString('ja-JP')}
                      </td>
                      <td className="py-2 pr-4 text-gray-400">
                        {log.joinedAt
                          ? new Date(log.joinedAt).toLocaleDateString('ja-JP')
                          : '—'}
                      </td>
                      <td className="py-2">
                        {log.joinedAt ? (
                          <span className="bg-emerald-900/50 text-emerald-400 text-xs px-2 py-0.5 rounded-full border border-emerald-700">
                            登録済
                          </span>
                        ) : (
                          <span className="bg-yellow-900/50 text-yellow-400 text-xs px-2 py-0.5 rounded-full border border-yellow-700">
                            未使用
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
