import { prisma } from '@/lib/prisma'

type RecentUser = { id: string; name: string | null; email: string | null; createdAt: Date }
type RecentPurchase = { id: string; amountJpy: number; paidAt: Date | null; user: { name: string | null }; plan: { name: string } }

async function getKpis(): Promise<{
  totalUsers: number
  newUsersThisMonth: number
  totalRevenue: number
  monthlyRevenue: number
  pendingPartners: number
  recentUsers: RecentUser[]
  recentPurchases: RecentPurchase[]
}> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [
    totalUsers,
    newUsersThisMonth,
    totalRevenue,
    monthlyRevenue,
    pendingPartners,
    recentUsers,
    recentPurchases,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.purchase.aggregate({ where: { status: 'paid' }, _sum: { amountJpy: true } }),
    prisma.purchase.aggregate({
      where: { status: 'paid', paidAt: { gte: startOfMonth } },
      _sum: { amountJpy: true },
    }),
    prisma.partnerProfile.count({ where: { status: 'pending' } }),
    prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, name: true, email: true, createdAt: true } }),
    prisma.purchase.findMany({
      where: { status: 'paid' },
      orderBy: { paidAt: 'desc' },
      take: 5,
      include: { user: { select: { name: true } }, plan: { select: { name: true } } },
    }),
  ])

  return {
    totalUsers,
    newUsersThisMonth,
    totalRevenue: totalRevenue._sum.amountJpy ?? 0,
    monthlyRevenue: monthlyRevenue._sum.amountJpy ?? 0,
    pendingPartners,
    recentUsers,
    recentPurchases,
  }
}

export default async function AdminDashboard() {
  const kpis = await getKpis()

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-2xl font-display font-light text-lw-text-primary">ダッシュボード</h1>

      {/* KPIカード */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: '総ユーザー数', value: kpis.totalUsers.toLocaleString(), color: 'text-lw-gold' },
          { label: '今月の新規', value: `+${kpis.newUsersThisMonth}`, color: 'text-lw-teal' },
          { label: '累計売上', value: `¥${kpis.totalRevenue.toLocaleString()}`, color: 'text-yellow-400' },
          {
            label: '今月の売上',
            value: `¥${kpis.monthlyRevenue.toLocaleString()}`,
            color: 'text-sky-400',
            badge: kpis.pendingPartners > 0 ? `承認待 ${kpis.pendingPartners}件` : null,
          },
        ].map((card) => (
          <div key={card.label} className="bg-lw-surface rounded-2xl p-5 border border-lw-gold/10">
            <div className="text-lw-text-secondary text-xs mb-2 tracking-[0.06em] uppercase">{card.label}</div>
            <div className={`text-3xl font-display font-light ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {kpis.pendingPartners > 0 && (
        <a
          href="/admin/partners"
          className="block bg-yellow-900/30 border border-yellow-700/50 rounded-xl p-4 text-yellow-400 hover:bg-yellow-900/50 transition-colors"
        >
          パートナー承認待ちが <strong>{kpis.pendingPartners}件</strong> あります →
        </a>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* 最近の登録 */}
        <div className="bg-lw-surface rounded-2xl p-5 border border-lw-gold/10">
          <h2 className="text-lw-text-secondary text-xs font-medium mb-4 tracking-[0.06em] uppercase">最近の登録ユーザー</h2>
          <div className="space-y-3">
            {kpis.recentUsers.map((u) => (
              <div key={u.id} className="flex justify-between text-sm">
                <div>
                  <div className="text-lw-text-primary">{u.name ?? '—'}</div>
                  <div className="text-lw-text-tertiary text-xs">{u.email}</div>
                </div>
                <div className="text-lw-text-tertiary text-xs">
                  {new Date(u.createdAt).toLocaleDateString('ja-JP')}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 最近の決済 */}
        <div className="bg-lw-surface rounded-2xl p-5 border border-lw-gold/10">
          <h2 className="text-lw-text-secondary text-xs font-medium mb-4 tracking-[0.06em] uppercase">最近の決済</h2>
          <div className="space-y-3">
            {kpis.recentPurchases.map((p) => (
              <div key={p.id} className="flex justify-between text-sm">
                <div>
                  <div className="text-lw-text-primary">{p.user.name ?? '—'}</div>
                  <div className="text-lw-text-tertiary text-xs">{p.plan.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-lw-teal">¥{p.amountJpy.toLocaleString()}</div>
                  <div className="text-lw-text-tertiary text-xs">
                    {p.paidAt ? new Date(p.paidAt).toLocaleDateString('ja-JP') : '—'}
                  </div>
                </div>
              </div>
            ))}
            {kpis.recentPurchases.length === 0 && (
              <p className="text-lw-text-tertiary text-sm">まだ決済がありません</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
