'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async () => {
    setLoading(true)
    setError('')

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setError('確認メールを送信しました。メールをご確認ください。')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else router.push('/')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0e1a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-lumiveil-sans)',
    }}>
      <div style={{
        background: '#111827',
        border: '1px solid #1e293b',
        borderRadius: '12px',
        padding: '48px',
        width: '100%',
        maxWidth: '400px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ color: '#c9a84c', fontSize: '24px', fontWeight: 500, letterSpacing: '0.08em', marginBottom: '8px' }}>
            ✦ LUMIVEIL
          </div>
          <div style={{ color: '#64748b', fontSize: '14px' }}>
            {isSignUp ? 'アカウント作成' : 'ログイン'}
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '14px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: '24px', position: 'relative' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="パスワード"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 76px 12px 16px',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '14px',
              boxSizing: 'border-box',
            }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(current => !current)}
            aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
            style={{
              position: 'absolute',
              right: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              padding: '6px 9px',
              borderRadius: '7px',
              border: '1px solid #334155',
              background: showPassword ? '#c9a84c' : 'rgba(255,255,255,0.04)',
              color: showPassword ? '#0a0e1a' : '#cbd5e1',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {showPassword ? '隠す' : '表示'}
          </button>
        </div>

        {error && (
          <div style={{ color: '#f87171', fontSize: '13px', marginBottom: '16px', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            background: '#c9a84c',
            border: 'none',
            borderRadius: '8px',
            color: '#0a0e1a',
            fontSize: '15px',
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? '処理中...' : isSignUp ? 'アカウント作成' : 'ログイン'}
        </button>

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            style={{ background: 'none', border: 'none', color: '#c9a84c', cursor: 'pointer', fontSize: '13px' }}
          >
            {isSignUp ? 'すでにアカウントをお持ちの方はこちら' : 'アカウントをお持ちでない方はこちら'}
          </button>
        </div>
      </div>
    </div>
  )
}
