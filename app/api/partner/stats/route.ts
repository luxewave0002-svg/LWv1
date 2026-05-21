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

  return NextResponse.json({
    referralCode: user?.referralCode ?? '',
    directCount: referrals.length,
    totalCount: Number(totalCount[0]?.count ?? 0),
    referrals,
  })
}
