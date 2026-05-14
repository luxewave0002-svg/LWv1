import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// パートナー申請
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { displayName, bio, websiteUrl } = await request.json()
  if (!displayName) {
    return NextResponse.json({ error: '表示名は必須です' }, { status: 400 })
  }

  const existing = await prisma.partnerProfile.findUnique({
    where: { userId: session.user.id },
  })
  if (existing) {
    return NextResponse.json({ error: '既に申請済みです' }, { status: 409 })
  }

  const profile = await prisma.partnerProfile.create({
    data: {
      userId: session.user.id,
      displayName,
      bio,
      websiteUrl,
      status: 'pending',
    },
  })
  return NextResponse.json(profile)
}

// パートナー情報取得
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profile = await prisma.partnerProfile.findUnique({
    where: { userId: session.user.id },
  })
  return NextResponse.json(profile)
}

// 管理者: パートナー承認/却下
export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { partnerId, action } = await request.json()
  const profile = await prisma.partnerProfile.update({
    where: { id: partnerId },
    data: {
      status: action === 'approve' ? 'active' : 'rejected',
      approvedAt: action === 'approve' ? new Date() : null,
    },
  })
  return NextResponse.json(profile)
}
