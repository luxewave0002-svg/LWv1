import Image from 'next/image'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { LogoutButton } from './logout-button'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  // 未ログインはログイン画面へ（認証後 /admin に戻れるよう next を渡す）。
  // ログイン済みで権限が無い場合だけ /partner に戻し、管理画面の存在を匂わせない。
  if (!session?.user) {
    redirect('/login?next=/admin')
  }
  if (session.user.role !== 'admin') {
    redirect('/partner')
  }

  return (
    <div className="min-h-screen bg-lw-deep text-lw-text-primary flex">
      {/* サイドバー */}
      <aside className="w-56 bg-lw-void border-r border-lw-gold/10 flex flex-col py-6">
        <div className="px-5 mb-8">
          <Image src="/logo.png" alt="LUXE WAVE" width={128} height={32} className="h-8 w-auto select-none" />
          <p className="text-lw-text-tertiary text-[10px] tracking-[0.1em] mt-1 uppercase">管理者パネル</p>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {[
            { href: '/admin', label: 'ダッシュボード' },
            { href: '/admin/users', label: 'ユーザー管理' },
            { href: '/admin/partners', label: 'パートナー管理' },
            { href: '/admin/plans', label: 'プラン管理' },
            { href: '/admin/payments', label: '決済管理' },
            { href: '/admin/tree', label: '全体ツリー' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded-lg text-lw-text-secondary hover:bg-lw-gold/10 hover:text-lw-text-primary transition-colors text-sm"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="px-5 mt-4 space-y-2 border-t border-lw-gold/10 pt-4">
          <div className="text-xs text-lw-text-tertiary px-3 truncate">
            {session.user.name ?? session.user.email}
          </div>
          <a
            href="/account"
            className="block px-3 py-2 rounded-lg text-lw-text-tertiary hover:bg-lw-gold/10 hover:text-lw-text-secondary transition-colors text-sm"
          >
            アカウント設定
          </a>
          <a
            href="/partner"
            className="block px-3 py-2 rounded-lg text-lw-text-tertiary hover:bg-lw-gold/10 hover:text-lw-text-secondary transition-colors text-sm"
          >
            パートナー画面へ
          </a>
          <LogoutButton />
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
