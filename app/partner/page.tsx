'use client'

export const dynamic = 'force-dynamic'

import Image from 'next/image'
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

type PointEntry = {
  id: string
  amount: number
  type: string
  description: string | null
  createdAt: string
  sourceUser: { id: string; name: string | null } | null
}

type Stats = {
  directCount: number
  totalCount: number
  referrals: Referral[]
  referralCode: string
  // マイグレーション前のレスポンスや古いキャッシュでも壊れないよう任意扱いにする
  points?: number
  pointHistory?: PointEntry[]
}

// ─── Icons ────────────────────────────────────────────────
function IconHome({ active }: { active: boolean }) {
  return (
    <svg className={`w-6 h-6 ${active ? 'text-lw-gold' : 'text-lw-text-tertiary'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9.75L12 3l9 6.75V21a.75.75 0 01-.75.75H15.75a.75.75 0 01-.75-.75v-4.5h-6V21a.75.75 0 01-.75.75H3.75A.75.75 0 013 21V9.75z" />
    </svg>
  )
}
function IconShare({ active }: { active: boolean }) {
  return (
    <svg className={`w-6 h-6 ${active ? 'text-lw-gold' : 'text-lw-text-tertiary'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
    </svg>
  )
}
function IconTree({ active }: { active: boolean }) {
  return (
    <svg className={`w-6 h-6 ${active ? 'text-lw-gold' : 'text-lw-text-tertiary'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18m0-18c-4 0-7 2-7 5s3 5 7 5m0-10c4 0 7 2 7 5s-3 5-7 5m0 4c-3 0-5.5 1.5-5.5 3.5M12 21c3 0 5.5-1.5 5.5-3.5" />
    </svg>
  )
}
function IconMenu({ active }: { active: boolean }) {
  return (
    <svg className={`w-6 h-6 ${active ? 'text-lw-gold' : 'text-lw-text-tertiary'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  )
}

// ─── Points ───────────────────────────────────────────────
function PointsCard({ points }: { points: number }) {
  return (
    <div className="bg-gradient-to-r from-lw-gold/10 to-lw-teal/10 border border-lw-gold/20 rounded-2xl p-5">
      <p className="text-lw-text-tertiary text-[9px] uppercase tracking-[0.18em]">保有ポイント</p>
      <div className="flex items-baseline gap-1.5 mt-1.5">
        <span className="text-5xl font-sans font-light tracking-tight text-lw-gold leading-none">{points}</span>
        <span className="text-lw-gold/70 text-lg font-sans font-light leading-none">pt</span>
      </div>
      <div className="w-8 h-px bg-lw-gold/25 my-2.5" />
      <p className="text-lw-text-tertiary text-[10px]">紹介した方の登録・プラン加入で貯まります</p>
    </div>
  )
}

function pointLabel(entry: PointEntry) {
  const who = entry.sourceUser?.name ?? 'メンバー'
  if (entry.type === 'referral_signup') return `${who} さんが登録`
  if (entry.type === 'referral_purchase') return `${who} さんが有料プランに加入`
  return entry.description ?? 'ポイント付与'
}

function PointHistoryCard({ history }: { history: PointEntry[] }) {
  return (
    <div className="bg-lw-surface rounded-2xl p-5 border border-lw-gold/10">
      <h2 className="text-lw-text-primary text-sm font-medium mb-3">
        ポイント履歴{' '}
        <span className="text-lw-text-tertiary font-normal">({history.length}件)</span>
      </h2>
      {history.length === 0 ? (
        <p className="text-lw-text-tertiary text-sm">まだポイントの獲得はありません</p>
      ) : (
        <div className="space-y-3">
          {history.map((e) => (
            <div key={e.id} className="flex items-center justify-between py-1 border-b border-lw-gold/5 last:border-0">
              <div className="min-w-0 pr-3">
                <div className="text-lw-text-primary text-sm font-medium truncate">{pointLabel(e)}</div>
                <div className="text-lw-text-tertiary text-xs">
                  {new Date(e.createdAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <span className="flex-shrink-0 bg-lw-gold-muted/30 text-lw-gold text-xs px-2.5 py-1 rounded-full border border-lw-gold-muted font-medium">
                +{e.amount}pt
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
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
        <p className="text-lw-text-tertiary text-xs tracking-[0.1em] uppercase">おかえりなさい</p>
        <h1 className="text-xl font-medium text-lw-text-primary mt-0.5">{session?.user?.name ?? session?.user?.email}</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-lw-surface rounded-2xl p-5 border border-lw-gold/10 text-center">
          <p className="text-lw-text-tertiary text-[9px] uppercase tracking-[0.18em] mb-1">直接</p>
          <div className="text-5xl font-sans font-light tracking-tight text-lw-gold leading-none">{stats.directCount}</div>
          <div className="w-8 h-px bg-lw-gold/25 mx-auto my-2" />
          <div className="text-lw-text-tertiary text-[10px]">名を招待</div>
        </div>
        <div className="bg-lw-surface rounded-2xl p-5 border border-lw-gold/10 text-center">
          <p className="text-lw-text-tertiary text-[9px] uppercase tracking-[0.18em] mb-1">総計</p>
          <div className="text-5xl font-sans font-light tracking-tight text-lw-teal leading-none">{stats.totalCount}</div>
          <div className="w-8 h-px bg-lw-teal/25 mx-auto my-2" />
          <div className="text-lw-text-tertiary text-[10px]">名のメンバー</div>
        </div>
      </div>

      {/* Points */}
      <PointsCard points={stats.points ?? 0} />

      {/* Quick invite */}
      <div className="bg-lw-surface rounded-2xl p-5 border border-lw-gold/10 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lw-text-primary text-sm font-medium">招待リンク</h2>
          <span className="bg-lw-gold-muted/30 text-lw-gold font-mono px-3 py-1 rounded-full text-xs border border-lw-gold-muted">
            {stats.referralCode}
          </span>
        </div>
        <div className="bg-lw-raised rounded-lg px-3 py-2 text-xs text-lw-text-tertiary font-mono break-all leading-relaxed border border-lw-gold/5">
          {inviteUrl}
        </div>
        <button
          onClick={copyUrl}
          className="w-full bg-lw-gold hover:bg-lw-gold-mid active:bg-lw-gold-muted text-lw-void py-3 rounded-xl text-sm font-semibold transition-colors"
        >
          {copied ? '✓ コピー済み' : 'URLをコピー'}
        </button>
      </div>

      {/* Invite list preview */}
      {stats.referrals.length > 0 && (
        <div className="bg-lw-surface rounded-2xl p-5 border border-lw-gold/10">
          <h2 className="text-lw-text-primary text-sm font-medium mb-3">招待したメンバー</h2>
          <div className="space-y-3">
            {stats.referrals.slice(0, 3).map((r) => (
              <div key={r.id} className="flex items-center justify-between">
                <div>
                  <div className="text-lw-text-primary text-sm font-medium">{r.name ?? r.email}</div>
                  <div className="text-lw-text-tertiary text-xs">{new Date(r.createdAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} 登録</div>
                </div>
                <span className="bg-lw-teal-muted/40 text-lw-teal text-xs px-2 py-1 rounded-full border border-lw-teal-mid/50">登録済</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Point history */}
      <PointHistoryCard history={stats.pointHistory ?? []} />
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
      <h1 className="text-xl font-medium text-lw-text-primary">招待する</h1>

      {qrDataUrl && (
        <div className="bg-lw-surface rounded-2xl p-5 border border-lw-gold/10 flex flex-col items-center gap-4">
          <p className="text-lw-text-tertiary text-xs tracking-[0.06em] uppercase">QRコードをスキャン</p>
          <div className="bg-white p-3 rounded-2xl">
            <img src={qrDataUrl} alt="QRコード" width={200} height={200} loading="eager" style={{ display: 'block' }} />
          </div>
          <a
            href={qrDataUrl}
            download="invite-qr.png"
            className="w-full bg-lw-raised border border-lw-gold/15 hover:border-lw-gold/30 text-lw-text-secondary py-3 rounded-xl text-sm font-medium text-center transition-colors"
          >
            QRコードをダウンロード
          </a>
        </div>
      )}

      <div className="bg-lw-surface rounded-2xl p-5 border border-lw-gold/10 space-y-3">
        <p className="text-lw-text-tertiary text-xs tracking-[0.06em] uppercase">招待URLを共有</p>
        <div className="bg-lw-raised rounded-xl px-4 py-3 text-xs text-lw-text-secondary font-mono break-all border border-lw-gold/5">
          {inviteUrl}
        </div>
        <button
          onClick={copyUrl}
          className="w-full bg-lw-gold hover:bg-lw-gold-mid active:bg-lw-gold-muted text-lw-void py-4 rounded-xl font-bold text-base transition-colors"
        >
          {copied ? '✓ コピーしました' : 'URLをコピー'}
        </button>
      </div>

      <div className="bg-lw-surface rounded-2xl p-5 border border-lw-gold/10">
        <h2 className="text-lw-text-primary text-sm font-medium mb-3">
          招待したメンバー一覧{' '}
          <span className="text-lw-text-tertiary font-normal">({stats.referrals.length}件)</span>
        </h2>
        {stats.referrals.length === 0 ? (
          <p className="text-lw-text-tertiary text-sm">まだ誰も招待していません</p>
        ) : (
          <div className="space-y-3">
            {stats.referrals.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-1 border-b border-lw-gold/5 last:border-0">
                <div>
                  <div className="text-lw-text-primary text-sm font-medium">{r.name ?? <span className="text-lw-text-tertiary">名前未設定</span>}</div>
                  <div className="text-lw-text-tertiary text-xs">{r.email}</div>
                </div>
                <div className="text-right">
                  <span className="bg-lw-teal-muted/40 text-lw-teal text-xs px-2.5 py-1 rounded-full border border-lw-teal-mid/50">登録済</span>
                  <div className="text-lw-text-tertiary text-xs mt-1">{new Date(r.createdAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
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
      <h1 className="text-xl font-medium text-lw-text-primary">メニュー</h1>
      <div className="bg-lw-surface rounded-2xl p-5 border border-lw-gold/10 space-y-1">
        <div className="flex items-center gap-3 pb-4 border-b border-lw-gold/10 mb-2">
          <div className="w-12 h-12 rounded-full bg-lw-gold flex items-center justify-center text-lw-void font-bold text-xl">
            {(session?.user?.name ?? session?.user?.email ?? '?')[0].toUpperCase()}
          </div>
          <div>
            <div className="text-lw-text-primary font-semibold">{session?.user?.name ?? '—'}</div>
            <div className="text-lw-text-tertiary text-xs">{session?.user?.email}</div>
          </div>
        </div>
        {session?.user?.role === 'admin' && (
          <a href="/admin" className="flex items-center justify-between w-full px-3 py-3.5 rounded-xl hover:bg-lw-gold/10 transition-colors">
            <span className="text-red-400 font-medium">管理者パネル</span>
            <span className="text-lw-text-tertiary">›</span>
          </a>
        )}
        <a href={`/tree?userId=${session?.user?.id}`} className="flex items-center justify-between w-full px-3 py-3.5 rounded-xl hover:bg-lw-gold/10 transition-colors">
          <span className="text-lw-text-secondary">招待ツリーを見る</span>
          <span className="text-lw-text-tertiary">›</span>
        </a>
        <a href="/invite" className="flex items-center justify-between w-full px-3 py-3.5 rounded-xl hover:bg-lw-gold/10 transition-colors">
          <span className="text-lw-text-secondary">招待コード管理</span>
          <span className="text-lw-text-tertiary">›</span>
        </a>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center justify-between w-full px-3 py-3.5 rounded-xl hover:bg-lw-gold/10 transition-colors"
        >
          <span className="text-lw-text-tertiary">ログアウト</span>
          <span className="text-lw-text-tertiary">›</span>
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
    <div className="min-h-screen bg-lw-void text-lw-text-primary p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Image src="/logo.png" alt="LUXE WAVE" width={128} height={32} className="h-8 w-auto select-none" />
            <p className="text-lw-text-tertiary text-xs tracking-[0.08em] mt-1">パートナーダッシュボード</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-lw-text-secondary text-sm">{session?.user?.name ?? session?.user?.email}</span>
            {session?.user?.role === 'admin' && (
              <a href="/admin" className="text-xs px-3 py-1.5 rounded-lg bg-red-900/40 text-red-400 border border-red-800 hover:bg-red-900/60 transition-colors">
                管理者パネル
              </a>
            )}
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-xs px-3 py-1.5 rounded-lg border border-lw-gold/10 text-lw-text-secondary hover:border-lw-gold/20 hover:text-lw-text-primary transition-colors"
            >
              ログアウト
            </button>
          </div>
        </div>

        <div className="bg-lw-surface rounded-2xl p-6 border border-lw-gold/10">
          <h2 className="text-xs font-medium text-lw-text-secondary mb-4 tracking-[0.08em] uppercase">あなたの招待リンク</h2>
          <div className="flex gap-4 items-start">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-lw-text-tertiary uppercase tracking-wider">招待コード</span>
                <span className="bg-lw-gold-muted/30 text-lw-gold font-mono px-3 py-1 rounded-full text-sm border border-lw-gold-muted">
                  {stats.referralCode}
                </span>
              </div>
              <div className="bg-lw-raised border border-lw-gold/10 rounded-lg px-4 py-3 font-mono text-sm text-lw-text-secondary break-all">
                {inviteUrl}
              </div>
              <div className="flex gap-3">
                <button onClick={copyUrl} className="bg-lw-gold hover:bg-lw-gold-mid text-lw-void px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  {copied ? '✓ コピー済み' : 'URLをコピー'}
                </button>
              </div>
            </div>
            {qrDataUrl && (
              <div className="flex-shrink-0 flex flex-col items-center gap-2">
                <div className="bg-white p-2 rounded-xl">
                  <img src={qrDataUrl} alt="QRコード" width={160} height={160} loading="eager" style={{ display: 'block' }} />
                </div>
                <a
                  href={qrDataUrl}
                  download="invite-qr.png"
                  className="text-xs text-lw-text-tertiary hover:text-lw-text-primary border border-lw-gold/10 hover:border-lw-gold/25 px-3 py-1.5 rounded-lg transition-colors w-full text-center"
                >
                  ダウンロード
                </a>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-lw-surface rounded-2xl p-6 border border-lw-gold/10 text-center">
            <p className="text-lw-text-tertiary text-[9px] uppercase tracking-[0.18em] mb-2">直接招待</p>
            <div className="text-5xl font-sans font-light tracking-tight text-lw-gold leading-none">{stats.directCount}</div>
            <div className="w-8 h-px bg-lw-gold/25 mx-auto my-2" />
            <div className="text-lw-text-tertiary text-xs">名を招待</div>
          </div>
          <div className="bg-lw-surface rounded-2xl p-6 border border-lw-gold/10 text-center">
            <p className="text-lw-text-tertiary text-[9px] uppercase tracking-[0.18em] mb-2">総配下人数</p>
            <div className="text-5xl font-sans font-light tracking-tight text-lw-teal leading-none">{stats.totalCount}</div>
            <div className="w-8 h-px bg-lw-teal/25 mx-auto my-2" />
            <div className="text-lw-text-tertiary text-xs">名のメンバー</div>
          </div>
        </div>

        <PointsCard points={stats.points ?? 0} />

        <a href={`/tree?userId=${session?.user?.id}`}
          className="block bg-gradient-to-r from-lw-gold/10 to-lw-teal/10 hover:from-lw-gold/15 hover:to-lw-teal/15 border border-lw-gold/20 rounded-2xl p-5 text-center transition-all">
          <span className="text-lw-gold font-medium text-lg">招待ツリーを見る →</span>
        </a>

        <div className="bg-lw-surface rounded-2xl p-6 border border-lw-gold/10">
          <h2 className="text-xs font-medium text-lw-text-secondary mb-4 tracking-[0.08em] uppercase">
            招待したメンバー一覧
            <span className="ml-2 font-normal text-lw-text-tertiary normal-case">{stats.referrals.length}名</span>
          </h2>
          {stats.referrals.length === 0 ? (
            <p className="text-lw-text-tertiary text-sm">まだ誰も招待していません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-lw-gold/10 text-lw-text-secondary">
                    <th className="text-left py-2 pr-4 font-medium">名前</th>
                    <th className="text-left py-2 pr-4 font-medium">メールアドレス</th>
                    <th className="text-left py-2 font-medium">登録日</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.referrals.map((r) => (
                    <tr key={r.id} className="border-b border-lw-gold/5 hover:bg-lw-gold/5 transition-colors">
                      <td className="py-3 pr-4 text-lw-text-primary font-medium">{r.name ?? <span className="text-lw-text-tertiary">未設定</span>}</td>
                      <td className="py-3 pr-4 text-lw-text-secondary">{r.email}</td>
                      <td className="py-3 text-lw-text-secondary">{new Date(r.createdAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <PointHistoryCard history={stats.pointHistory ?? []} />
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
    if (!stats?.referralCode) return
    let cancelled = false
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    QRCode.toDataURL(`${origin}/login?invite=${stats.referralCode}`, { width: 220, margin: 1 }).then((url) => {
      if (!cancelled) setQrDataUrl(url)
    })
    return () => { cancelled = true }
  }, [stats?.referralCode])

  if (status === 'loading' || !stats) {
    return (
      <div className="min-h-screen bg-lw-void flex items-center justify-center">
        <div className="text-lw-text-secondary text-lg animate-pulse">読み込み中...</div>
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
      <div className="md:hidden min-h-screen bg-lw-deep text-lw-text-primary overflow-y-auto">
        {/* モバイルヘッダー */}
        <header className="sticky top-0 z-10 bg-lw-deep/95 backdrop-blur border-b border-lw-gold/10 px-4 py-3 flex items-center justify-between">
          <Image src="/logo.png" alt="LUXE WAVE" width={128} height={32} className="h-8 w-auto select-none" />
          <span className="text-lw-text-tertiary text-xs">{session?.user?.name ?? session?.user?.email}</span>
        </header>

        {/* コンテンツ */}
        {mobileTab === 'home' && <MobileHome stats={stats} session={session} qrDataUrl={qrDataUrl} />}
        {mobileTab === 'invite' && <MobileInvite stats={stats} qrDataUrl={qrDataUrl} />}
        {mobileTab === 'tree' && (
          <div className="flex flex-col items-center justify-center gap-4 px-4 pt-12 pb-24">
            <p className="text-lw-text-secondary text-sm">招待ツリーを確認できます</p>
            <a href={`/tree?userId=${session?.user?.id}`}
              className="bg-lw-gold hover:bg-lw-gold-mid text-lw-void px-8 py-4 rounded-2xl font-bold text-lg transition-colors">
              ツリーを見る
            </a>
          </div>
        )}
        {mobileTab === 'menu' && <MobileMenuTab session={session} />}

        {/* ボトムナビ */}
        <nav className="fixed bottom-0 left-0 right-0 z-20 bg-lw-base/95 backdrop-blur border-t border-lw-gold/10">
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
                aria-label={label}
                aria-current={mobileTab === id ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 py-3 transition-colors ${
                  mobileTab === id ? 'text-lw-gold' : 'text-lw-text-tertiary'
                }`}
                style={mobileTab === id ? { boxShadow: 'inset 0 2px 0 #D4A843' } : undefined}
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
