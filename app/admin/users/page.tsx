'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'

type User = {
  id: string
  name: string | null
  email: string | null
  role: string
  createdAt: string
  referralCode: string
  _count: { referrals: number }
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setUsers(data))
      .finally(() => setLoading(false))
  }, [])

  async function updateRole(userId: string, role: string) {
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    })
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)))
  }

  const filtered = users.filter(
    (u) =>
      !search ||
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">ユーザー管理</h1>
        <span className="text-gray-400 text-sm">{users.length}名</span>
      </div>

      <input
        type="search"
        placeholder="名前またはメールで検索..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-[#1a1a2e] border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500"
      />

      <div className="bg-[#1a1a2e] rounded-2xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-white/10">
            <tr className="text-gray-400">
              {['名前', 'メール', 'ロール', '招待数', '登録日', '操作'].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-500">読み込み中...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-500">ユーザーが見つかりません</td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 text-white">{u.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{u.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${
                        u.role === 'admin'
                          ? 'bg-red-900/50 text-red-400 border-red-700'
                          : 'bg-gray-900/50 text-gray-400 border-gray-700'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{u._count.referrals}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {new Date(u.createdAt).toLocaleDateString('ja-JP')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <a
                        href={`/tree?userId=${u.id}`}
                        className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                      >
                        ツリー
                      </a>
                      {u.role !== 'admin' && (
                        <button
                          onClick={() => updateRole(u.id, 'admin')}
                          className="text-xs text-yellow-400 hover:text-yellow-300 transition-colors"
                        >
                          管理者に
                        </button>
                      )}
                    </div>
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
