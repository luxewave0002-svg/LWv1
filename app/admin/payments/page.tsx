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
  paid: 'text-emerald-400',
  pending: 'text-yellow-400',
  failed: 'text-red-400',
  refunded: 'text-gray-400',
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

  // 月別集計
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
        <h1 className="text-2xl font-bold text-white">決済管理</h1>
        <button
          onClick={exportCsv}
          className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm transition-colors"
        >
          CSVエクスポート
        </button>
      </div>

      {chartData.length > 0 && (
        <div className="bg-[#1a1a2e] rounded-2xl p-5 border border-white/10">
          <h2 className="text-gray-300 font-semibold mb-4">月別売上</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="month" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} tickFormatter={(v) => `¥${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: '#1a1a2e', border: '1px solid #ffffff20', borderRadius: 8 }}
                formatter={(v) => [`¥${Number(v).toLocaleString()}`, '売上']}
              />
              <Bar dataKey="amount" fill="#7c3aed" radius={4} />
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
                  ? 'bg-violet-600 text-white'
                  : 'bg-white/10 text-gray-400 hover:bg-white/20'
              }`}
            >
              {s === 'all' ? 'すべて' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="text-emerald-400 font-bold">
          合計: ¥{totalPaid.toLocaleString()}
        </div>
      </div>

      <div className="bg-[#1a1a2e] rounded-2xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-white/10">
            <tr className="text-gray-400">
              {['ユーザー', 'プラン', '金額', 'ステータス', '日時'].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-500">読み込み中...</td></tr>
            ) : purchases.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-500">決済履歴がありません</td></tr>
            ) : (
              purchases.map((p) => (
                <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3">
                    <div className="text-white">{p.user.name ?? '—'}</div>
                    <div className="text-gray-500 text-xs">{p.user.email}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{p.plan.name}</td>
                  <td className="px-4 py-3 text-white font-mono">¥{p.amountJpy.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${STATUS_COLORS[p.status] ?? 'text-gray-400'}`}>
                      {STATUS_LABELS[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
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
