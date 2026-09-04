import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  grantPointsSafely,
  grantReferralPurchasePoints,
  revokeReferralPurchasePoints,
} from '@/lib/points'

const STATUSES = ['pending', 'paid', 'failed', 'refunded'] as const

async function requireAdmin() {
  const session = await auth()
  if (session?.user?.role !== 'admin') return null
  return session
}

type PurchaseWithRelations = {
  id: string
  amountJpy: number
  status: string
  createdAt: Date
  user: { name: string | null; email: string | null }
  plan: { name: string }
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const status = request.nextUrl.searchParams.get('status')

  const purchases = await prisma.purchase.findMany({
    where: status ? { status } : undefined,
    include: { user: { select: { name: true, email: true } }, plan: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  // CSVエクスポート
  if (request.nextUrl.searchParams.get('format') === 'csv') {
    const rows = [
      ['ID', 'ユーザー', 'メール', 'プラン', '金額', 'ステータス', '日時'],
      ...purchases.map((p: PurchaseWithRelations) => [
        p.id,
        p.user.name ?? '',
        p.user.email ?? '',
        p.plan.name,
        p.amountJpy.toString(),
        p.status,
        p.createdAt.toISOString(),
      ]),
    ]
    const csv = rows.map((r) => r.join(',')).join('\n')
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="payments.csv"',
      },
    })
  }

  return NextResponse.json(purchases)
}

/**
 * 決済ステータスの手動更新（URL決済のため、入金確認は人が行う）。
 * 「決済済」にした時点で紹介者への15ptが確定し、取り消せば戻る。
 */
export async function PATCH(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, status } = await request.json()
  if (!id || !STATUSES.includes(status)) {
    return NextResponse.json({ error: 'id と正しい status が必要です' }, { status: 400 })
  }

  const before = await prisma.purchase.findUnique({ where: { id }, select: { status: true } })
  if (!before) return NextResponse.json({ error: '購入記録が見つかりません' }, { status: 404 })

  await prisma.purchase.update({
    where: { id },
    data: { status, paidAt: status === 'paid' ? new Date() : null },
  })

  // 付与も取り消しも eventKey 基準で冪等。webhook が後から来ても二重にはならない。
  if (status === 'paid' && before.status !== 'paid') {
    await grantPointsSafely(`referral purchase for purchase ${id}`, () =>
      grantReferralPurchasePoints(id)
    )
  } else if (status !== 'paid' && before.status === 'paid') {
    await grantPointsSafely(`revoke referral purchase for purchase ${id}`, () =>
      revokeReferralPurchasePoints(id).then((r) =>
        r.revoked
          ? ({ granted: true, amount: -(r.amount ?? 0), balance: 0 } as const)
          : ({ granted: false, reason: 'already_granted' } as const)
      )
    )
  }

  const updated = await prisma.purchase.findUnique({
    where: { id },
    include: { user: { select: { name: true, email: true } }, plan: true },
  })
  return NextResponse.json(updated)
}

/** 購入記録の手動作成（決済URLをサイト外で送った場合の記録用） */
export async function POST(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId, planId, status } = await request.json()
  if (!userId || !planId) {
    return NextResponse.json({ error: 'ユーザーとプランを選択してください' }, { status: 400 })
  }
  const nextStatus = STATUSES.includes(status) ? status : 'pending'

  const plan = await prisma.plan.findUnique({ where: { id: planId } })
  if (!plan) return NextResponse.json({ error: 'プランが存在しません' }, { status: 404 })

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) return NextResponse.json({ error: 'ユーザーが存在しません' }, { status: 404 })

  const purchase = await prisma.purchase.create({
    data: {
      userId,
      planId,
      amountJpy: plan.priceJpy,
      status: nextStatus,
      paidAt: nextStatus === 'paid' ? new Date() : null,
    },
  })

  if (nextStatus === 'paid') {
    await grantPointsSafely(`referral purchase for purchase ${purchase.id}`, () =>
      grantReferralPurchasePoints(purchase.id)
    )
  }

  return NextResponse.json(purchase)
}
