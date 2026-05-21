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
  _count: { referrals: number; purchases: number }
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all')
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null)

  useEffect(() => {
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setUsers(data))
      .finally(() => setLoading(false))
  }, [])

  async function toggleRole(user: User) {
    const newRole = user.role === 'admin' ? 'user' : 'admin'
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, role: newRole }),
    })
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role: newRole } : u)))
  }

  async function deleteUser(user: User) {
    setDeletingId(user.id)
    const res = await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id }),
    })
    if (res.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== user.id))
    }
    setDeletingId(null)
    setConfirmDelete(null)
  }

  const filtered = users.filter((u) => {
    const matchSearch =
      !search ||
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
    const matchRole = roleFilter === 'all' || u.role === roleFilter
    return matchSearch && matchRole
  })

  const adminCount = users.filter((u) => u.role === 'admin').length

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">ユーザー管理</h1>
          <p className="text-gray-500 text-sm mt-1">
            全 {users.length} 名（管理者 {adminCount} 名）
          </p>
        </div>
      </div>

      {/* 検索・フィルター */}
      <div className="flex gap-3">
        <input
          type="search"
          placeholder="名前またはメールで検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-[#1a1a2e] border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500"
        />
        <div className="flex bg-[#1a1a2e] border border-white/20 rounded-xl overflow-hidden">
          {(['all', 'user', 'admin'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-4 py-2.5 text-sm transition-colors ${
                roleFilter === r
                  ? 'bg-violet-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {r === 'all' ? 'すべて' : r === 'admin' ? '管理者' : '一般'}
            </button>
          ))}
        </div>
      </div>

      {/* テーブル */}
      <div className="bg-[#1a1a2e] rounded-2xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-white/10 bg-white/5">
            <tr className="text-gray-400">
              <th className="text-left px-4 py-3 font-medium">名前</th>
              <th className="text-left px-4 py-3 font-medium">メール</th>
              <th className="text-left px-4 py-3 font-medium">ロール</th>
              <th className="text-left px-4 py-3 font-medium">招待 / 購入</th>
              <th className="text-left px-4 py-3 font-medium">登録日</th>
              <th className="text-left px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-gray-500">読み込み中...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-gray-500">
                  {search || roleFilter !== 'all' ? '条件に一致するユーザーがいません' : 'ユーザーがいません'}
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-white font-medium">{u.name ?? <span className="text-gray-500">未設定</span>}</div>
                    <div className="text-gray-500 text-xs font-mono">{u.referralCode}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{u.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
                        u.role === 'admin'
                          ? 'bg-red-900/30 text-red-400 border-red-800'
                          : 'bg-gray-900/50 text-gray-400 border-gray-700'
                      }`}
                    >
                      {u.role === 'admin' ? '管理者' : '一般'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    <span className="text-violet-400">{u._count.referrals}</span> 招待 /{' '}
                    <span className="text-emerald-400">{u._count.purchases}</span> 購入
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(u.createdAt).toLocaleDateString('ja-JP')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <a
                        href={`/tree?userId=${u.id}`}
                        className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                      >
                        ツリー
                      </a>
                      <button
                        onClick={() => toggleRole(u)}
                        className={`text-xs transition-colors ${
                          u.role === 'admin'
                            ? 'text-gray-400 hover:text-white'
                            : 'text-yellow-400 hover:text-yellow-300'
                        }`}
                      >
                        {u.role === 'admin' ? '一般に戻す' : '管理者に'}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(u)}
                        className="text-xs text-red-500 hover:text-red-400 transition-colors"
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 削除確認モーダル */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-white font-bold text-lg">ユーザーを削除しますか？</h2>
            <div className="bg-[#0f0f1a] rounded-xl p-4 text-sm space-y-1">
              <div className="text-white">{confirmDelete.name ?? '（名前なし）'}</div>
              <div className="text-gray-400">{confirmDelete.email}</div>
            </div>
            <p className="text-red-400 text-sm">
              この操作は取り消せません。関連する招待ログ・購入記録も削除されます。
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2 rounded-lg border border-white/20 text-gray-300 hover:bg-white/10 transition-colors text-sm"
              >
                キャンセル
              </button>
              <button
                onClick={() => deleteUser(confirmDelete)}
                disabled={deletingId === confirmDelete.id}
                className="flex-1 py-2 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white font-semibold transition-colors text-sm"
              >
                {deletingId === confirmDelete.id ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
