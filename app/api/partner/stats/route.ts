import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  const [user, directReferrals, inviteLogs] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } }),
    prisma.user.count({ where: { referrerId: userId } }),
    prisma.inviteLog.findMany({
      where: { inviterId: userId },
      include: { invitee: { select: { name: true, email: true } } },
      orderBy: { invitedAt: 'desc' },
      take: 50,
    }),
  ])

  // 全配下を再帰的にカウント（簡易版：直接のみ）
  // 本格的にはgetTreeNodes()を使い全ノード数を返す
  const totalCount = await prisma.$queryRaw<{ count: bigint }[]>`
    WITH RECURSIVE tree AS (
      SELECT id FROM users WHERE referrer_id = ${userId}
      UNION ALL
      SELECT u.id FROM tree t JOIN users u ON u.referrer_id = t.id
    )
    SELECT COUNT(*) as count FROM tree
  `

  return NextResponse.json({
    referralCode: user?.referralCode ?? '',
    directCount: directReferrals,
    totalCount: Number(totalCount[0]?.count ?? 0),
    inviteLogs,
  })
}
