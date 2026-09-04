import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { grantPointsSafely, grantReferralPurchasePoints } from '@/lib/points'
import { verifyWebhookAuth } from '@/lib/univapay'

export async function POST(request: NextRequest) {
  // UNIVAPAY_WEBHOOK_AUTH_TOKEN が設定されている場合のみ検証する（未設定なら素通し）
  const auth = verifyWebhookAuth(request.headers)
  if (!auth.ok) {
    console.warn('[univapay] webhook rejected:', auth.reason)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { event, data } = body

  if (event === 'charge_finished' && data?.id) {
    const purchase = await prisma.purchase.findUnique({
      where: { univaTransactionId: data.id },
    })

    if (purchase) {
      await prisma.purchase.update({
        where: { id: purchase.id },
        data: {
          status: data.status === 'successful' ? 'paid' : 'failed',
          paidAt: data.status === 'successful' ? new Date() : null,
        },
      })

      // 有料プラン加入の成立 → 紹介者に 15pt。
      // charge 側で既に付与済みでも eventKey が同じなので二重付与にはならない。
      if (data.status === 'successful') {
        await grantPointsSafely(`referral purchase for purchase ${purchase.id}`, () =>
          grantReferralPurchasePoints(purchase.id)
        )
      }
    }
  }

  return NextResponse.json({ received: true })
}
