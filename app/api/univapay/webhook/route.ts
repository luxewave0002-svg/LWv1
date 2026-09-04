import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { grantPointsSafely, grantReferralPurchasePoints } from '@/lib/points'

export async function POST(request: NextRequest) {
  // 本番では Webhook シークレット検証を追加
  // const signature = request.headers.get('x-univapay-signature')
  // if (!verifySignature(signature, body)) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

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
