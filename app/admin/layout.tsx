import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user || session.user.role !== 'admin') {
    redirect('/partner')
  }

  return (
    <div className="min-h-screen bg-[#0a0a14] text-white flex">
      {/* サイドバー */}
      <aside className="w-56 bg-[#0f0f1a] border-r border-white/10 flex flex-col py-6">
        <div className="px-5 mb-8">
          <span className="text-violet-400 font-bold text-lg">管理者パネル</span>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {[
            { href: '/admin', label: 'ダッシュボード' },
            { href: '/admin/users', label: 'ユーザー管理' },
            { href: '/admin/partners', label: 'パートナー管理' },
            { href: '/admin/payments', label: '決済管理' },
            { href: '/admin/tree', label: '全体ツリー' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded-lg text-gray-300 hover:bg-white/10 hover:text-white transition-colors text-sm"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="px-5 text-xs text-gray-600">
          {session.user.name ?? session.user.email}
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
