'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'

type PartnerProfile = {
  id: string
  displayName: string
  bio: string | null
  websiteUrl: string | null
  status: string
  approvedAt: string | null
  createdAt: string
  user: { name: string | null; email: string | null; _count: { sentInvites: number } }
}

export default function AdminPartnersPage() {
  const [partners, setPartners] = useState<PartnerProfile[]>([])
  const [filter, setFilter] = useState<'pending' | 'active' | 'all'>('pending')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/partners')
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setPartners(data))
      .finally(() => setLoading(false))
  }, [])

  async function handleAction(partnerId: string, action: 'approve' | 'reject') {
    await fetch('/api/partner', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partnerId, action }),
    })
    setPartners((prev) =>
      prev.map((p) =>
        p.id === partnerId
          ? { ...p, status: action === 'approve' ? 'active' : 'rejected', approvedAt: action === 'approve' ? new Date().toISOString() : null }
          : p
      )
    )
  }

  const filtered = partners.filter((p) => filter === 'all' || p.status === filter)
  const pendingCount = partners.filter((p) => p.status === 'pending').length

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-light text-lw-text-primary">パートナー管理</h1>
        {pendingCount > 0 && (
          <span className="bg-yellow-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">
            {pendingCount}件 承認待ち
          </span>
        )}
      </div>

      <div className="flex gap-2">
        {(['pending', 'active', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-lw-gold text-lw-void'
                : 'bg-lw-raised text-lw-text-tertiary hover:text-lw-text-secondary border border-lw-gold/10'
            }`}
          >
            {f === 'pending' ? '承認待ち' : f === 'active' ? '承認済み' : 'すべて'}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="text-lw-text-tertiary text-center py-8">読み込み中...</div>
        ) : filtered.length === 0 ? (
          <div className="text-lw-text-tertiary text-center py-8">該当するパートナーがいません</div>
        ) : (
          filtered.map((p) => (
            <div key={p.id} className="bg-lw-surface rounded-2xl p-5 border border-lw-gold/10">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-lw-text-primary font-semibold">{p.displayName}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${
                        p.status === 'active'
                          ? 'bg-lw-teal-muted/40 text-lw-teal border-lw-teal-mid/50'
                          : p.status === 'pending'
                          ? 'bg-yellow-900/50 text-yellow-400 border-yellow-700'
                          : 'bg-red-900/50 text-red-400 border-red-700'
                      }`}
                    >
                      {p.status === 'active' ? '承認済' : p.status === 'pending' ? '申請中' : '却下'}
                    </span>
                  </div>
                  <div className="text-lw-text-secondary text-sm">
                    {p.user.name} / {p.user.email}
                  </div>
                  {p.bio && <div className="text-lw-text-tertiary text-sm mt-2">{p.bio}</div>}
                  {p.websiteUrl && (
                    <a
                      href={p.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-lw-gold text-xs mt-1 inline-block hover:underline"
                    >
                      {p.websiteUrl}
                    </a>
                  )}
                  <div className="text-lw-text-tertiary text-xs mt-2">
                    申請日: {new Date(p.createdAt).toLocaleDateString('ja-JP')} ／ 招待実績: {p.user._count.sentInvites}件
                  </div>
                </div>
                {p.status === 'pending' && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleAction(p.id, 'approve')}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      承認
                    </button>
                    <button
                      onClick={() => handleAction(p.id, 'reject')}
                      className="bg-red-900/50 hover:bg-red-900 border border-red-700 text-red-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      却下
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
