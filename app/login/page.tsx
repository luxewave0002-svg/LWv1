'use client'

export const dynamic = 'force-dynamic'

import Image from 'next/image'
import { signIn } from 'next-auth/react'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [confirm, setConfirm] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  useEffect(() => {
    const code = searchParams.get('invite') ?? searchParams.get('ref') ?? ''
    if (code) {
      setInviteCode(code)
      setTab('register')
    }
    if (searchParams.get('tab') === 'register') setTab('register')
  }, [searchParams])

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-lw-void">
      {/* Wordmark */}
      <div className="mb-8 text-center">
        <Image src="/logo.png" alt="LUXE WAVE" width={192} height={48} className="h-12 w-auto mx-auto select-none" />
        <div className="mt-2 h-px w-24 mx-auto bg-lw-gold/30" />
      </div>

      <div className="w-full max-w-md bg-lw-surface rounded-2xl p-8 shadow-2xl border border-lw-gold/10">
        {/* Tab switcher */}
        <div className="flex mb-8 border-b border-lw-gold/10">
          {(['login', 'register'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError('') }}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t
                  ? 'border-lw-gold text-lw-text-primary'
                  : 'border-transparent text-lw-text-tertiary hover:text-lw-text-secondary'
              }`}
            >
              {t === 'login' ? 'ログイン' : '新規登録'}
            </button>
          ))}
        </div>

        {tab === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs text-lw-text-tertiary mb-1.5 tracking-[0.08em] uppercase">メールアドレス</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                className="w-full bg-lw-raised border border-lw-gold/15 rounded-lg px-4 py-2.5 text-lw-text-primary focus:outline-none focus:border-lw-gold-muted transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-lw-text-tertiary mb-1.5 tracking-[0.08em] uppercase">パスワード</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                className="w-full bg-lw-raised border border-lw-gold/15 rounded-lg px-4 py-2.5 text-lw-text-primary focus:outline-none focus:border-lw-gold-muted transition-colors" />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-lw-gold hover:bg-lw-gold-mid disabled:opacity-50 text-lw-void font-semibold py-2.5 rounded-lg transition-colors">
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs text-lw-text-tertiary mb-1.5 tracking-[0.08em] uppercase">お名前</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
                className="w-full bg-lw-raised border border-lw-gold/15 rounded-lg px-4 py-2.5 text-lw-text-primary focus:outline-none focus:border-lw-gold-muted transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-lw-text-tertiary mb-1.5 tracking-[0.08em] uppercase">メールアドレス</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                className="w-full bg-lw-raised border border-lw-gold/15 rounded-lg px-4 py-2.5 text-lw-text-primary focus:outline-none focus:border-lw-gold-muted transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-lw-text-tertiary mb-1.5 tracking-[0.08em] uppercase">パスワード（8文字以上）</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
                className="w-full bg-lw-raised border border-lw-gold/15 rounded-lg px-4 py-2.5 text-lw-text-primary focus:outline-none focus:border-lw-gold-muted transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-lw-text-tertiary mb-1.5 tracking-[0.08em] uppercase">パスワード確認</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required
                className="w-full bg-lw-raised border border-lw-gold/15 rounded-lg px-4 py-2.5 text-lw-text-primary focus:outline-none focus:border-lw-gold-muted transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-lw-text-tertiary mb-1.5 tracking-[0.08em] uppercase">
                招待コード <span className="text-red-400">*</span>
                {inviteCode && <span className="ml-2 normal-case text-lw-gold text-xs">（自動入力済み）</span>}
              </label>
              <input type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)}
                placeholder="招待コードを入力してください"
                required
                className={`w-full bg-lw-raised border rounded-lg px-4 py-2.5 text-lw-text-primary focus:outline-none focus:border-lw-gold-muted transition-colors ${
                  inviteCode ? 'border-lw-gold/60' : 'border-lw-gold/15'
                }`} />
              <p className="text-xs text-lw-text-tertiary mt-1">招待コードをお持ちでない方は登録できません</p>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-lw-gold hover:bg-lw-gold-mid disabled:opacity-50 text-lw-void font-semibold py-2.5 rounded-lg transition-colors">
              {loading ? '登録中...' : 'アカウントを作成'}
            </button>
          </form>
        )}

        <div className="flex items-center my-6">
          <div className="flex-1 border-t border-lw-gold/10" />
          <span className="px-4 text-sm text-lw-text-tertiary">または</span>
          <div className="flex-1 border-t border-lw-gold/10" />
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

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
