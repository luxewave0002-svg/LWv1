'use client'

export const dynamic = 'force-dynamic'

import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [confirm, setConfirm] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await signIn('credentials', { email, password, redirect: false })
    if (res?.error) {
      setError('メールアドレスまたはパスワードが正しくありません')
    } else {
      router.push('/partner')
    }
    setLoading(false)
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('パスワードが一致しません')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, inviteCode: inviteCode || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '登録に失敗しました')
        setLoading(false)
        return
      }
      const login = await signIn('credentials', { email, password, redirect: false })
      if (login?.error) {
        setError('登録しましたがログインに失敗しました。ログインタブからお試しください。')
      } else {
        router.push('/partner')
      }
    } catch {
      setError('サーバーに接続できませんでした。しばらく待ってから再試行してください。')
    }
    setLoading(false)
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true)
    await signIn('google', { callbackUrl: '/partner' })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a]">
      <div className="w-full max-w-md bg-[#1a1a2e] rounded-2xl p-8 shadow-2xl border border-white/10">
        <div className="flex mb-8 bg-[#0f0f1a] rounded-xl p-1">
          {(['login', 'register'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === t ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {t === 'login' ? 'ログイン' : '新規登録'}
            </button>
          ))}
        </div>

        {tab === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm text-gray-400 mb-1">メールアドレス</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                className="w-full bg-[#0f0f1a] border border-white/20 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-violet-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">パスワード</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                className="w-full bg-[#0f0f1a] border border-white/20 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-violet-500" />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors">
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">お名前</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
                className="w-full bg-[#0f0f1a] border border-white/20 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-violet-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">メールアドレス</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                className="w-full bg-[#0f0f1a] border border-white/20 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-violet-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">パスワード（8文字以上）</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
                className="w-full bg-[#0f0f1a] border border-white/20 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-violet-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">パスワード確認</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required
                className="w-full bg-[#0f0f1a] border border-white/20 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-violet-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">招待コード（任意）</label>
              <input type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)}
                className="w-full bg-[#0f0f1a] border border-white/20 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-violet-500" />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors">
              {loading ? '登録中...' : 'アカウントを作成'}
            </button>
          </form>
        )}

        <div className="flex items-center my-6">
          <div className="flex-1 border-t border-white/10" />
          <span className="px-4 text-sm text-gray-500">または</span>
          <div className="flex-1 border-t border-white/10" />
        </div>

        <button
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 disabled:opacity-50 text-gray-800 font-semibold py-2.5 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {googleLoading ? '処理中...' : 'Google でログイン / 登録'}
        </button>
      </div>
    </div>
  )
}
