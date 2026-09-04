'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

type Purchase = {
  id: string
  amountJpy: number
  status: string
  createdAt: string
  paidAt: string | null
  user: { name: string | null; email: string | null }
  plan: { name: string }
}

const STATUS_COLORS: Record<string, string> = {
  paid: 'text-lw-teal',
  pending: 'text-yellow-400',
  failed: 'text-red-400',
  refunded: 'text-lw-text-tertiary',
}

const STATUS_LABELS: Record<string, string> = {
  paid: '支払済',
  pending: '保留中',
  failed: '失敗',
  refunded: '返金済',
}

export default function AdminPaymentsPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<{ id: string; name: string | null; email: string | null }[]>([])
  const [plans, setPlans] = useState<{ id: string; name: string; priceJpy: number }[]>([])
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ userId: '', planId: '', status: 'pending' })
  const [busyId, setBusyId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function reload() {
    const q = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
    const data = await (await fetch(`/api/admin/payments${q}`)).json()
    if (Array.isArray(data)) setPurchases(data)
  }

  /** URL決済は入金確認が人手なので、ここで決済済／未決済を切り替える */
  async function changeStatus(purchase: Purchase, status: string) {
    setBusyId(purchase.id)
    setError('')
    const res = await fetch('/api/admin/payments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: purchase.id, status }),
    })
    if (!res.ok) setError((await res.json()).error ?? '更新に失敗しました')
    await reload()
    setBusyId(null)
  }

  async function openAdd() {
    setError('')
    setDraft({ userId: '', planId: '', status: 'pending' })
    setAdding(true)
    const [u, pl] = await Promise.all([
      fetch('/api/admin/users').then((r) => r.json()),
      fetch('/api/admin/plans').then((r) => r.json()),
    ])
    if (Array.isArray(u)) setUsers(u)
    if (Array.isArray(pl)) setPlans(pl)
  }

  async function createPurchase() {
    setSaving(true)
    setError('')
    const res = await fetch('/api/admin/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    if (!res.ok) {
      setError((await res.json()).error ?? '登録に失敗しました')
    } else {
      setAdding(false)
      await reload()
    }
    setSaving(false)
  }

  useEffect(() => {
    const q = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
    fetch(`/api/admin/payments${q}`)
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setPurchases(data))
      .finally(() => setLoading(false))
  }, [statusFilter])

  const monthlySales = purchases
    .filter((p) => p.status === 'paid' && p.paidAt)
    .reduce<Record<string, number>>((acc, p) => {
      const month = new Date(p.paidAt!).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit' })
      acc[month] = (acc[month] ?? 0) + p.amountJpy
      return acc
    }, {})

  const chartData = Object.entries(monthlySales)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({ month, amount }))

  function exportCsv() {
    window.open('/api/admin/payments?format=csv')
  }

  const totalPaid = purchases.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amountJpy, 0)

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-light text-lw-text-primary">決済管理</h1>
        <div className="flex gap-3">
          <button
            onClick={exportCsv}
            className="border border-lw-gold/15 hover:border-lw-gold/30 text-lw-text-secondary hover:text-lw-text-primary px-4 py-2 rounded-lg text-sm transition-colors"
          >
            CSVエクスポート
          </button>
          <button
            onClick={openAdd}
            className="bg-lw-gold hover:bg-lw-gold-mid text-lw-void px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            ＋ 購入記録を追加
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
      )}

      {chartData.length > 0 && (
        <div className="bg-lw-surface rounded-2xl p-5 border border-lw-gold/10">
          <h2 className="text-lw-text-secondary text-xs font-medium mb-4 tracking-[0.06em] uppercase">月別売上</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,168,67,0.08)" />
              <XAxis dataKey="month" tick={{ fill: '#9A9590', fontSize: 12 }} />
              <YAxis tick={{ fill: '#9A9590', fontSize: 12 }} tickFormatter={(v) => `¥${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: '#141828', border: '1px solid rgba(212,168,67,0.15)', borderRadius: 8, color: '#F0EDE8' }}
                formatter={(v) => [`¥${Number(v).toLocaleString()}`, '売上']}
              />
              <Bar dataKey="amount" fill="#D4A843" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['all', 'paid', 'pending', 'failed', 'refunded'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-lw-gold text-lw-void'
                  : 'bg-lw-raised text-lw-text-tertiary hover:text-lw-text-secondary border border-lw-gold/10'
              }`}
            >
              {s === 'all' ? 'すべて' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="text-lw-teal font-display font-light text-lg">
          合計: ¥{totalPaid.toLocaleString()}
        </div>
      </div>

      <div className="bg-lw-surface rounded-2xl border border-lw-gold/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-lw-gold/10">
            <tr className="text-lw-text-secondary">
              {['ユーザー', 'プラン', '金額', 'ステータス', '日時', '操作'].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-lw-text-tertiary">読み込み中...</td></tr>
            ) : purchases.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-lw-text-tertiary">決済履歴がありません</td></tr>
            ) : (
              purchases.map((p) => (
                <tr key={p.id} className="border-b border-lw-gold/5 hover:bg-lw-gold/[0.03] transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-lw-text-primary">{p.user.name ?? '—'}</div>
                    <div className="text-lw-text-tertiary text-xs">{p.user.email}</div>
                  </td>
                  <td className="px-4 py-3 text-lw-text-secondary">{p.plan.name}</td>
                  <td className="px-4 py-3 text-lw-text-primary font-mono">¥{p.amountJpy.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${STATUS_COLORS[p.status] ?? 'text-lw-text-tertiary'}`}>
                      {STATUS_LABELS[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-lw-text-secondary text-xs">
                    {p.paidAt
                      ? new Date(p.paidAt).toLocaleDateString('ja-JP')
                      : new Date(p.createdAt).toLocaleDateString('ja-JP')}
                  </td>
                  <td className="px-4 py-3">
                    {p.status === 'paid' ? (
                      <button
                        onClick={() => changeStatus(p, 'pending')}
                        disabled={busyId === p.id}
                        className="text-xs text-lw-text-secondary hover:text-lw-text-primary disabled:opacity-50 transition-colors"
                      >
                        未決済に戻す
                      </button>
                    ) : (
                      <button
                        onClick={() => changeStatus(p, 'paid')}
                        disabled={busyId === p.id}
                        className="text-xs text-lw-teal hover:text-lw-teal/80 disabled:opacity-50 transition-colors"
                      >
                        決済済にする
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 購入記録の手動追加 */}
      {adding && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-lw-surface border border-lw-gold/10 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lw-text-primary font-bold text-lg">購入記録を追加</h2>
            <p className="text-lw-text-tertiary text-xs">
              決済URLをサイト外で送った場合の記録用です。「決済済」で登録すると、その時点で紹介者に15ptが入ります。
            </p>

            <div>
              <label className="block text-xs text-lw-text-secondary mb-1.5">ユーザー</label>
              <select
                value={draft.userId}
                onChange={(e) => setDraft({ ...draft, userId: e.target.value })}
                className="w-full bg-lw-raised border border-lw-gold/15 rounded-lg px-3 py-2.5 text-lw-text-primary focus:outline-none focus:border-lw-gold-muted transition-colors"
              >
                <option value="">選択してください</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name ?? '(名前未設定)'} — {u.email}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-lw-text-secondary mb-1.5">プラン</label>
              <select
                value={draft.planId}
                onChange={(e) => setDraft({ ...draft, planId: e.target.value })}
                className="w-full bg-lw-raised border border-lw-gold/15 rounded-lg px-3 py-2.5 text-lw-text-primary focus:outline-none focus:border-lw-gold-muted transition-colors"
              >
                <option value="">選択してください</option>
                {plans.map((pl) => (
                  <option key={pl.id} value={pl.id}>{pl.name} — ¥{pl.priceJpy.toLocaleString()}</option>
                ))}
              </select>
              {plans.length === 0 && (
                <p className="text-yellow-400 text-[11px] mt-1.5">
                  プランが登録されていません。先にプラン管理で作成してください。
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs text-lw-text-secondary mb-1.5">ステータス</label>
              <select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                className="w-full bg-lw-raised border border-lw-gold/15 rounded-lg px-3 py-2.5 text-lw-text-primary focus:outline-none focus:border-lw-gold-muted transition-colors"
              >
                <option value="pending">未決済</option>
                <option value="paid">決済済</option>
              </select>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setAdding(false); setError('') }}
                className="flex-1 py-2 rounded-lg border border-lw-gold/15 text-lw-text-secondary hover:border-lw-gold/30 hover:text-lw-text-primary transition-colors text-sm"
              >
                キャンセル
              </button>
              <button
                onClick={createPurchase}
                disabled={saving || !draft.userId || !draft.planId}
                className="flex-1 py-2 rounded-lg bg-lw-gold hover:bg-lw-gold-mid disabled:opacity-50 text-lw-void font-semibold transition-colors text-sm"
              >
                {saving ? '登録中...' : '登録'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
