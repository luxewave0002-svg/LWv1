import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * URL決済の開始。
 *
 * 「未決済」の購入記録を先に作り、UnivaPay の決済ページURLを返す。
 * 入金の確定は webhook か、管理画面での手動切り替えで行う。
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { planId } = await request.json()
  if (!planId) {
    return NextResponse.json({ error: 'planId は必須です' }, { status: 400 })
  }

  const plan = await prisma.plan.findUnique({ where: { id: planId } })
  if (!plan || !plan.isActive) {
    return NextResponse.json({ error: 'プランが存在しません' }, { status: 404 })
  }
  if (!plan.paymentUrl) {
    return NextResponse.json(
      { error: 'このプランはまだ購入できません（決済URLが未設定です）' },
      { status: 409 }
    )
  }

  const purchase = await prisma.purchase.create({
    data: {
      userId: session.user.id,
      planId: plan.id,
      amountJpy: plan.priceJpy,
      status: 'pending',
    },
  })

  return NextResponse.json({ purchaseId: purchase.id, paymentUrl: plan.paymentUrl })
}
