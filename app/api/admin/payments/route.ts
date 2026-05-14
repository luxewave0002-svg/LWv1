import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
