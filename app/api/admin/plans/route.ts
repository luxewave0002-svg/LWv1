import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// checkout 画面のラベル定義と揃えること（app/checkout/page.tsx の BILLING_LABEL）
const BILLING_TYPES = ['one_time', 'monthly', 'yearly'] as const

async function requireAdmin() {
  const session = await auth()
  if (session?.user?.role !== 'admin') return null
  return session
}

type PlanInput = {
  name?: unknown
  description?: unknown
  priceJpy?: unknown
  billingType?: unknown
}

/** 受け取った値を検証し、Prisma に渡せる形に整える */
function parsePlan(body: PlanInput, { partial }: { partial: boolean }) {
  const data: { name?: string; description?: string | null; priceJpy?: number; billingType?: string } = {}

  if (body.name !== undefined || !partial) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return { error: 'プラン名は必須です' }
    data.name = name
  }

  if (body.description !== undefined) {
    const d = typeof body.description === 'string' ? body.description.trim() : ''
    data.description = d === '' ? null : d
  }

  if (body.priceJpy !== undefined || !partial) {
    const price = Number(body.priceJpy)
    if (!Number.isInteger(price) || price < 0) return { error: '金額は0以上の整数で指定してください' }
    data.priceJpy = price
  }

  if (body.billingType !== undefined || !partial) {
    const t = String(body.billingType)
    if (!BILLING_TYPES.includes(t as (typeof BILLING_TYPES)[number])) {
      return { error: '課金種別が不正です' }
    }
    data.billingType = t
  }

  return { data }
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const plans = await prisma.plan.findMany({
    // 有効なプランを先に、その中では安い順
    orderBy: [{ isActive: 'desc' }, { priceJpy: 'asc' }],
    select: {
      id: true,
      name: true,
      description: true,
      priceJpy: true,
      billingType: true,
      isActive: true,
      createdAt: true,
      _count: { select: { purchases: true } },
    },
  })
  return NextResponse.json(plans)
}

export async function POST(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = parsePlan(body, { partial: false })
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const plan = await prisma.plan.create({
    data: {
      name: parsed.data!.name!,
      description: parsed.data!.description ?? null,
      priceJpy: parsed.data!.priceJpy!,
      billingType: parsed.data!.billingType!,
      isActive: body.isActive !== false,
    },
  })
  return NextResponse.json(plan)
}

export async function PATCH(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  if (!body.id) return NextResponse.json({ error: 'id は必須です' }, { status: 400 })

  const parsed = parsePlan(body, { partial: true })
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const plan = await prisma.plan.update({
    where: { id: body.id },
    data: {
      ...parsed.data,
      ...(typeof body.isActive === 'boolean' ? { isActive: body.isActive } : {}),
    },
  })
  return NextResponse.json(plan)
}

export async function DELETE(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id は必須です' }, { status: 400 })

  // 購入履歴があるプランは消せない。会計記録が壊れるので、停止して非表示にする運用にする。
  const count = await prisma.purchase.count({ where: { planId: id } })
  if (count > 0) {
    return NextResponse.json(
      { error: `このプランには購入履歴が ${count} 件あるため削除できません。「停止」にして非表示にしてください。` },
      { status: 409 }
    )
  }

  await prisma.plan.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
