'use client'

export const dynamic = 'force-dynamic'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function AccountPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setDone(false)

    if (next !== confirm) {
      setError('新しいパスワードが一致しません')
      return
    }
    if (next.length < 8) {
      setError('新しいパスワードは8文字以上にしてください')
      return
    }

    setSaving(true)
    const res = await fetch('/api/account/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? '変更に失敗しました')
    } else {
      setDone(true)
      setCurrent('')
      setNext('')
      setConfirm('')
    }
    setSaving(false)
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-lw-void flex items-center justify-center">
        <div className="text-lw-text-secondary animate-pulse">読み込み中...</div>
      </div>
    )
  }

  const inputClass =
    'w-full bg-lw-raised border border-lw-gold/15 rounded-lg px-3 py-2.5 text-lw-text-primary placeholder:text-lw-text-tertiary focus:outline-none focus:border-lw-gold-muted transition-colors'

  return (
    <div className="min-h-screen bg-lw-void text-lw-text-primary p-6">
      <div className="max-w-md mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-display font-light text-lw-gold">アカウント設定</h1>
          <p className="text-lw-text-tertiary text-sm mt-1">{session?.user?.email}</p>
        </div>

        <form onSubmit={submit} className="bg-lw-surface rounded-2xl p-6 border border-lw-gold/10 space-y-4">
          <h2 className="text-xs font-medium text-lw-text-secondary tracking-[0.08em] uppercase">パスワードの変更</h2>

          <div>
            <label className="block text-xs text-lw-text-secondary mb-1.5">現在のパスワード</label>
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-lw-text-secondary mb-1.5">新しいパスワード</label>
            <input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className={inputClass}
            />
            <p className="text-lw-text-tertiary text-[11px] mt-1.5">8文字以上</p>
          </div>
          <div>
            <label className="block text-xs text-lw-text-secondary mb-1.5">新しいパスワード（確認）</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
          {done && <p className="text-lw-teal text-sm">パスワードを変更しました。</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-lw-gold hover:bg-lw-gold-mid disabled:opacity-50 text-lw-void font-semibold py-2.5 rounded-lg transition-colors"
          >
            {saving ? '変更中...' : 'パスワードを変更'}
          </button>
        </form>

        <div className="flex gap-3">
          <a
            href="/partner"
            className="flex-1 text-center border border-lw-gold/15 hover:border-lw-gold/30 text-lw-text-secondary hover:text-lw-text-primary px-4 py-2.5 rounded-xl text-sm transition-colors"
          >
            パートナー画面へ
          </a>
          {session?.user?.role === 'admin' && (
            <a
              href="/admin"
              className="flex-1 text-center border border-lw-gold/15 hover:border-lw-gold/30 text-lw-text-secondary hover:text-lw-text-primary px-4 py-2.5 rounded-xl text-sm transition-colors"
            >
              管理者パネルへ
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
