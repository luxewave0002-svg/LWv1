'use client'

export const dynamic = 'force-dynamic'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

type Referral = {
  id: string
  name: string | null
  email: string | null
  createdAt: string
}

type Stats = {
  directCount: number
  totalCount: number
  referrals: Referral[]
  referralCode: string
}

// ─── Icons ────────────────────────────────────────────────
function IconHome({ active }: { active: boolean }) {
  return (
    <svg className={`w-6 h-6 ${active ? 'text-violet-400' : 'text-gray-500'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9.75L12 3l9 6.75V21a.75.75 0 01-.75.75H15.75a.75.75 0 01-.75-.75v-4.5h-6V21a.75.75 0 01-.75.75H3.75A.75.75 0 013 21V9.75z" />
    </svg>
  )
}
function IconShare({ active }: { active: boolean }) {
  return (
    <svg className={`w-6 h-6 ${active ? 'text-violet-400' : 'text-gray-500'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
    </svg>
  )
}
function IconTree({ active }: { active: boolean }) {
  return (
    <svg className={`w-6 h-6 ${active ? 'text-violet-400' : 'text-gray-500'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18m0-18c-4 0-7 2-7 5s3 5 7 5m0-10c4 0 7 2 7 5s-3 5-7 5m0 4c-3 0-5.5 1.5-5.5 3.5M12 21c3 0 5.5-1.5 5.5-3.5" />
    </svg>
  )
}
function IconMenu({ active }: { active: boolean }) {
  return (
    <svg className={`w-6 h-6 ${active ? 'text-violet-400' : 'text-gray-500'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  )
}

// ─── Mobile Screens ───────────────────────────────────────
function MobileHome({ stats, session, qrDataUrl }: { stats: Stats; session: any; qrDataUrl: string }) {
  const [copied, setCopied] = useState(false)
  const inviteUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/login?invite=${stats.referralCode}`

  function copyUrl() {
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4 px-4 pt-4 pb-24">
      {/* Greeting */}
      <div>
        <p className="text-gray-400 text-sm">おかえりなさい</p>
        <h1 className="text-xl font-bold text-white">{session?.user?.name ?? session?.user?.email}</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#1a1a2e] rounded-2xl p-5 border border-white/10 text-center">
          <div className="text-4xl font-bold text-violet-400">{stats.directCount}</div>
          <div className="text-gray-400 text-sm mt-1">直接招待</div>
        </div>
        <div className="bg-[#1a1a2e] rounded-2xl p-5 border border-white/10 text-center">
          <div className="text-4xl font-bold text-emerald-400">{stats.totalCount}</div>
          <div className="text-gray-400 text-sm mt-1">総配下人数</div>
        </div>
      </div>

      {/* Quick invite */}
      <div className="bg-[#1a1a2e] rounded-2xl p-5 border border-white/10 space-y-3">
        <h2 className="text-gray-300 font-semibold">あなたの招待リンク</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">コード:</span>
          <span className="bg-violet-900/50 text-violet-300 font-mono px-3 py-1 rounded-full text-sm border border-violet-700">
            {stats.referralCode}
          </span>
        </div>
        <div className="bg-[#0f0f1a] rounded-lg px-3 py-2 text-xs text-gray-400 font-mono break-all leading-relaxed">
          {inviteUrl}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={copyUrl}
            className="bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white py-3 rounded-xl text-sm font-semibold transition-colors"
          >
            {copied ? '✓ コピー' : 'コピー'}
          </button>
          <a
            href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(inviteUrl)}`}
            target="_blank" rel="noopener noreferrer"
            className="bg-sky-600 hover:bg-sky-700 text-white py-3 rounded-xl text-sm font-semibold text-center transition-colors"
          >
            X
          </a>
          <a
            href={`https://line.me/R/msg/text/?${encodeURIComponent(inviteUrl)}`}
            target="_blank" rel="noopener noreferrer"
            className="bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl text-sm font-semibold text-center transition-colors"
          >
            LINE
          </a>
        </div>
      </div>

      {/* Invite list preview */}
      {stats.referrals.length > 0 && (
        <div className="bg-[#1a1a2e] rounded-2xl p-5 border border-white/10">
          <h2 className="text-gray-300 font-semibold mb-3">招待した人</h2>
          <div className="space-y-3">
            {stats.referrals.slice(0, 3).map((r) => (
              <div key={r.id} className="flex items-center justify-between">
                <div>
                  <div className="text-white text-sm font-medium">{r.name ?? r.email}</div>
                  <div className="text-gray-500 text-xs">{new Date(r.createdAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} 登録</div>
                </div>
                <span className="bg-emerald-900/40 text-emerald-400 text-xs px-2 py-1 rounded-full border border-emerald-800">登録済</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MobileInvite({ stats, qrDataUrl }: { stats: Stats; qrDataUrl: string }) {
  const [copied, setCopied] = useState(false)
  const inviteUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/login?invite=${stats.referralCode}`

  function copyUrl() {
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4 px-4 pt-4 pb-24">
      <h1 className="text-xl font-bold text-white">招待する</h1>

      {qrDataUrl && (
        <div className="bg-[#1a1a2e] rounded-2xl p-5 border border-white/10 flex flex-col items-center gap-3">
          <p className="text-gray-400 text-sm">QRコードをスキャン</p>
          <div className="bg-white p-3 rounded-2xl">
            <img src={qrDataUrl} alt="QRコード" width={200} height={200} />
          </div>
        </div>
      )}

      <div className="bg-[#1a1a2e] rounded-2xl p-5 border border-white/10 space-y-3">
        <p className="text-gray-400 text-sm">招待URLを共有</p>
        <div className="bg-[#0f0f1a] rounded-xl px-4 py-3 text-xs text-gray-300 font-mono break-all">
          {inviteUrl}
        </div>
        <button
          onClick={copyUrl}
          className="w-full bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white py-4 rounded-xl font-bold text-base transition-colors"
        >
          {copied ? '✓ コピーしました' : 'URLをコピー'}
        </button>
        <div className="grid grid-cols-2 gap-3">
          <a
            href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(inviteUrl)}`}
            target="_blank" rel="noopener noreferrer"
            className="bg-sky-600 hover:bg-sky-700 text-white py-3.5 rounded-xl font-semibold text-center text-sm transition-colors"
          >
            Xでシェア
          </a>
          <a
            href={`https://line.me/R/msg/text/?${encodeURIComponent(inviteUrl)}`}
            target="_blank" rel="noopener noreferrer"
            className="bg-green-600 hover:bg-green-700 text-white py-3.5 rounded-xl font-semibold text-center text-sm transition-colors"
          >
            LINEでシェア
          </a>
        </div>
      </div>

      <div className="bg-[#1a1a2e] rounded-2xl p-5 border border-white/10">
        <h2 className="text-gray-300 font-semibold mb-3">招待した人一覧 <span className="text-gray-500 text-sm font-normal">({stats.referrals.length}件)</span></h2>
        {stats.referrals.length === 0 ? (
          <p className="text-gray-500 text-sm">まだ誰も招待していません</p>
        ) : (
          <div className="space-y-3">
            {stats.referrals.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-1 border-b border-white/5 last:border-0">
                <div>
                  <div className="text-white text-sm font-medium">{r.name ?? <span className="text-gray-400">名前未設定</span>}</div>
                  <div className="text-gray-500 text-xs">{r.email}</div>
                </div>
                <div className="text-right">
                  <span className="bg-emerald-900/40 text-emerald-400 text-xs px-2.5 py-1 rounded-full border border-emerald-800">登録済</span>
                  <div className="text-gray-600 text-xs mt-1">{new Date(r.createdAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MobileMenuTab({ session }: { session: any }) {
  return (
    <div className="space-y-3 px-4 pt-4 pb-24">
      <h1 className="text-xl font-bold text-white">メニュー</h1>
      <div className="bg-[#1a1a2e] rounded-2xl p-5 border border-white/10 space-y-1">
        <div className="flex items-center gap-3 pb-4 border-b border-white/10 mb-2">
          <div className="w-12 h-12 rounded-full bg-violet-700 flex items-center justify-center text-white font-bold text-xl">
            {(session?.user?.name ?? session?.user?.email ?? '?')[0].toUpperCase()}
          </div>
          <div>
            <div className="text-white font-semibold">{session?.user?.name ?? '—'}</div>
            <div className="text-gray-400 text-xs">{session?.user?.email}</div>
          </div>
        </div>
        {session?.user?.role === 'admin' && (
          <a href="/admin" className="flex items-center justify-between w-full px-3 py-3.5 rounded-xl hover:bg-white/10 transition-colors">
            <span className="text-red-400 font-medium">管理者パネル</span>
            <span className="text-gray-500">›</span>
          </a>
        )}
        <a href={`/tree?userId=${session?.user?.id}`} className="flex items-center justify-between w-full px-3 py-3.5 rounded-xl hover:bg-white/10 transition-colors">
          <span className="text-gray-300">招待ツリーを見る</span>
          <span className="text-gray-500">›</span>
        </a>
        <a href="/invite" className="flex items-center justify-between w-full px-3 py-3.5 rounded-xl hover:bg-white/10 transition-colors">
          <span className="text-gray-300">招待コード管理</span>
          <span className="text-gray-500">›</span>
        </a>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center justify-between w-full px-3 py-3.5 rounded-xl hover:bg-white/10 transition-colors"
        >
          <span className="text-gray-400">ログアウト</span>
          <span className="text-gray-500">›</span>
        </button>
      </div>
    </div>
  )
}

// ─── Desktop View ─────────────────────────────────────────
function DesktopView({ stats, session, qrDataUrl }: { stats: Stats; session: any; qrDataUrl: string }) {
  const [copied, setCopied] = useState(false)
  const inviteUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/login?invite=${stats.referralCode}`

  function copyUrl() {
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-violet-400">パートナーダッシュボード</h1>
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm">{session?.user?.name ?? session?.user?.email}</span>
            {session?.user?.role === 'admin' && (
              <a href="/admin" className="text-xs px-3 py-1.5 rounded-lg bg-red-900/40 text-red-400 border border-red-800 hover:bg-red-900/60 transition-colors">
                管理者パネル
              </a>
            )}
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-xs px-3 py-1.5 rounded-lg bg-white/10 text-gray-300 hover:bg-white/20 transition-colors"
            >
              ログアウト
            </button>
          </div>
        </div>

        <div className="bg-[#1a1a2e] rounded-2xl p-6 border border-white/10">
          <h2 className="text-lg font-semibold text-gray-300 mb-4">あなたの招待リンク</h2>
          <div className="flex gap-4 items-start">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 uppercase tracking-wider">招待コード</span>
                <span className="bg-violet-900/50 text-violet-300 font-mono px-3 py-1 rounded-full text-sm border border-violet-700">
                  {stats.referralCode}
                </span>
              </div>
              <div className="bg-[#0f0f1a] border border-white/10 rounded-lg px-4 py-3 font-mono text-sm text-gray-300 break-all">
                {inviteUrl}
              </div>
              <div className="flex gap-3">
                <button onClick={copyUrl} className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  {copied ? '✓ コピー済み' : 'URLをコピー'}
                </button>
                <a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(inviteUrl)}`} target="_blank" rel="noopener noreferrer"
                  className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  Xでシェア
                </a>
                <a href={`https://line.me/R/msg/text/?${encodeURIComponent(inviteUrl)}`} target="_blank" rel="noopener noreferrer"
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  LINEでシェア
                </a>
              </div>
            </div>
            {qrDataUrl && (
              <div className="flex-shrink-0 bg-white p-2 rounded-xl">
                <img src={qrDataUrl} alt="QRコード" width={160} height={160} />
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[#1a1a2e] rounded-2xl p-6 border border-white/10 text-center">
            <div className="text-4xl font-bold text-violet-400">{stats.directCount}</div>
            <div className="text-gray-400 mt-1">直接招待数</div>
          </div>
          <div className="bg-[#1a1a2e] rounded-2xl p-6 border border-white/10 text-center">
            <div className="text-4xl font-bold text-emerald-400">{stats.totalCount}</div>
            <div className="text-gray-400 mt-1">総配下人数</div>
          </div>
        </div>

        <a href={`/tree?userId=${session?.user?.id}`}
          className="block bg-gradient-to-r from-violet-900/50 to-indigo-900/50 hover:from-violet-900/70 hover:to-indigo-900/70 border border-violet-700/50 rounded-2xl p-5 text-center transition-all">
          <span className="text-violet-300 font-semibold text-lg">招待ツリーを見る →</span>
        </a>

        <div className="bg-[#1a1a2e] rounded-2xl p-6 border border-white/10">
          <h2 className="text-lg font-semibold text-gray-300 mb-4">
            招待した人一覧
            <span className="ml-2 text-sm font-normal text-gray-500">{stats.referrals.length}名</span>
          </h2>
          {stats.referrals.length === 0 ? (
            <p className="text-gray-500 text-sm">まだ誰も招待していません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-gray-400">
                    <th className="text-left py-2 pr-4 font-medium">名前</th>
                    <th className="text-left py-2 pr-4 font-medium">メールアドレス</th>
                    <th className="text-left py-2 font-medium">登録日</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.referrals.map((r) => (
                    <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-3 pr-4 text-white font-medium">{r.name ?? <span className="text-gray-500">未設定</span>}</td>
                      <td className="py-3 pr-4 text-gray-400">{r.email}</td>
                      <td className="py-3 text-gray-400">{new Date(r.createdAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────
export default function PartnerPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [mobileTab, setMobileTab] = useState<'home' | 'invite' | 'tree' | 'menu'>('home')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    if (session?.user?.id) {
      fetch('/api/partner/stats').then((r) => r.json()).then(setStats)
    }
  }, [session])

  useEffect(() => {
    if (stats?.referralCode) {
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      QRCode.toDataURL(`${origin}/login?invite=${stats.referralCode}`, { width: 220, margin: 1 }).then(setQrDataUrl)
    }
  }, [stats])

  if (status === 'loading' || !stats) {
    return (
      <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
        <div className="text-white text-lg animate-pulse">読み込み中...</div>
      </div>
    )
  }

  return (
    <>
      {/* ── Desktop (md以上) ── */}
      <div className="hidden md:block">
        <DesktopView stats={stats} session={session} qrDataUrl={qrDataUrl} />
      </div>

      {/* ── Mobile (md未満) ── */}
      <div className="md:hidden min-h-screen bg-[#0a0a14] text-white overflow-y-auto">
        {/* モバイルヘッダー */}
        <header className="sticky top-0 z-10 bg-[#0a0a14]/95 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center justify-between">
          <span className="text-violet-400 font-bold text-base">LuxeWave</span>
          <span className="text-gray-400 text-xs">{session?.user?.name ?? session?.user?.email}</span>
        </header>

        {/* コンテンツ */}
        {mobileTab === 'home' && <MobileHome stats={stats} session={session} qrDataUrl={qrDataUrl} />}
        {mobileTab === 'invite' && <MobileInvite stats={stats} qrDataUrl={qrDataUrl} />}
        {mobileTab === 'tree' && (
          <div className="flex flex-col items-center justify-center gap-4 px-4 pt-12 pb-24">
            <p className="text-gray-400 text-sm">招待ツリーを確認できます</p>
            <a href={`/tree?userId=${session?.user?.id}`}
              className="bg-violet-600 hover:bg-violet-700 text-white px-8 py-4 rounded-2xl font-bold text-lg transition-colors">
              ツリーを見る
            </a>
          </div>
        )}
        {mobileTab === 'menu' && <MobileMenuTab session={session} />}

        {/* ボトムナビ */}
        <nav className="fixed bottom-0 left-0 right-0 z-20 bg-[#0f0f1a]/95 backdrop-blur border-t border-white/10">
          <div className="grid grid-cols-4">
            {[
              { id: 'home', label: 'ホーム', Icon: IconHome },
              { id: 'invite', label: '招待', Icon: IconShare },
              { id: 'tree', label: 'ツリー', Icon: IconTree },
              { id: 'menu', label: 'メニュー', Icon: IconMenu },
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setMobileTab(id as any)}
                className={`flex flex-col items-center gap-1 py-3 transition-colors ${
                  mobileTab === id ? 'text-violet-400' : 'text-gray-500'
                }`}
              >
                <Icon active={mobileTab === id} />
                <span className="text-xs">{label}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>
    </>
  )
}
