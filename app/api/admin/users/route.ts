import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function requireAdmin() {
  const session = await auth()
  if (session?.user?.role !== 'admin') return null
  return session
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      referralCode: true,
      points: true,
      _count: { select: { referrals: true, purchases: true } },
      // 決済状況の集計用。件数が少ないうちは取得して数える方が、
      // status ごとの絞り込みカウントを並べるより読みやすい。
      purchases: { select: { status: true, amountJpy: true } },
    },
  })

  const rows = users.map(({ purchases, ...user }) => {
    const paid = purchases.filter((p) => p.status === 'paid')
    const pending = purchases.filter((p) => p.status === 'pending')
    return {
      ...user,
      payment: {
        paidCount: paid.length,
        pendingCount: pending.length,
        paidTotal: paid.reduce((sum, p) => sum + p.amountJpy, 0),
      },
    }
  })

  return NextResponse.json(rows)
}

export async function PATCH(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId, role } = await request.json()
  if (!userId || !['admin', 'user'].includes(role)) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
  }
  const user = await prisma.user.update({ where: { id: userId }, data: { role } })
  return NextResponse.json(user)
}

export async function DELETE(request: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId } = await request.json()
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
  if (userId === session.user.id) {
    return NextResponse.json({ error: '自分自身は削除できません' }, { status: 400 })
  }

  await prisma.user.delete({ where: { id: userId } })
  return NextResponse.json({ ok: true })
}
