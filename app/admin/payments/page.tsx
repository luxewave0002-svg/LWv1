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
        <button
          onClick={exportCsv}
          className="border border-lw-gold/15 hover:border-lw-gold/30 text-lw-text-secondary hover:text-lw-text-primary px-4 py-2 rounded-lg text-sm transition-colors"
        >
          CSVエクスポート
        </button>
      </div>

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
              {['ユーザー', 'プラン', '金額', 'ステータス', '日時'].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-lw-text-tertiary">読み込み中...</td></tr>
            ) : purchases.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-lw-text-tertiary">決済履歴がありません</td></tr>
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
