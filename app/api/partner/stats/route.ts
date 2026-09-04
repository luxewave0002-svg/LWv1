import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  const [user, referrals, totalCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    }),
    // 直接招待したユーザー（referrerId 経由）
    prisma.user.findMany({
      where: { referrerId: userId },
      select: { id: true, name: true, email: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    // 全配下を再帰カウント
    prisma.$queryRaw<{ count: bigint }[]>`
      WITH RECURSIVE tree AS (
        SELECT id FROM users WHERE referrer_id = ${userId}
        UNION ALL
        SELECT u.id FROM tree t JOIN users u ON u.referrer_id = t.id
      )
      SELECT COUNT(*) as count FROM tree
    `,
  ])

  // ポイントはスキーマ追加が前提の機能なので、取得失敗をダッシュボード全体の
  // 障害にしない。マイグレーション未適用の状態でデプロイされても、
  // 紹介数・招待コードなど既存の表示は従来どおり動く。
  let points = 0
  let pointHistory: unknown[] = []
  try {
    const [pointUser, history] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { points: true } }),
      prisma.pointTransaction.findMany({
        where: { userId },
        select: {
          id: true,
          amount: true,
          type: true,
          description: true,
          createdAt: true,
          sourceUser: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ])
    points = pointUser?.points ?? 0
    pointHistory = history
  } catch (error) {
    console.error('[points] stats lookup failed (migration applied?):', error)
  }

  return NextResponse.json({
    referralCode: user?.referralCode ?? '',
    directCount: referrals.length,
    totalCount: Number(totalCount[0]?.count ?? 0),
    referrals,
    points,
    pointHistory,
  })
}
