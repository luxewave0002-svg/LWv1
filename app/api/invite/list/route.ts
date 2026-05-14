import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logs = await prisma.inviteLog.findMany({
    where: { inviterId: session.user.id },
    include: { invitee: { select: { name: true } } },
    orderBy: { invitedAt: 'desc' },
  })
  return NextResponse.json(logs)
}
