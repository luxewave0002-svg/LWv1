import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createCharge } from '@/lib/univapay'
import { grantPointsSafely, grantReferralPurchasePoints } from '@/lib/points'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { transactionTokenId, planId } = await request.json()
  if (!transactionTokenId || !planId) {
    return NextResponse.json({ error: 'パラメータ不足' }, { status: 400 })
  }

  const plan = await prisma.plan.findUnique({ where: { id: planId } })
  if (!plan || !plan.isActive) {
    return NextResponse.json({ error: 'プランが存在しません' }, { status: 404 })
  }

  // Purchaseレコード作成（pending）
  const purchase = await prisma.purchase.create({
    data: {
      userId: session.user.id,
      planId,
      amountJpy: plan.priceJpy,
      univaTokenId: transactionTokenId,
      status: 'pending',
    },
  })

  // 課金作成
  const charge = await createCharge({
    transactionTokenId,
    amountJpy: plan.priceJpy,
    metadata: { purchaseId: purchase.id, userId: session.user.id },
  })

  // モックでは即時成功扱い
  await prisma.purchase.update({
    where: { id: purchase.id },
    data: {
      univaTransactionId: charge.id,
      status: charge.status === 'successful' ? 'paid' : 'pending',
      paidAt: charge.status === 'successful' ? new Date() : null,
    },
  })

  // 有料プラン加入の成立 → 紹介者に 15pt。
  // Webhook 側からも同じ購入で呼ばれるが、eventKey が同じなので二重付与にはならない。
  if (charge.status === 'successful') {
    await grantPointsSafely(`referral purchase for purchase ${purchase.id}`, () =>
      grantReferralPurchasePoints(purchase.id)
    )
  }

  return NextResponse.json({ chargeId: charge.id, purchaseId: purchase.id })
}
