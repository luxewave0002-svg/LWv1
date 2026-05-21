import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// One-time endpoint: grants admin to the caller only when no admins exist yet.
// Safe to leave in place — becomes a no-op once the first admin is created.
export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'ログインしてください' }, { status: 401 })
  }

  const adminCount = await prisma.user.count({ where: { role: 'admin' } })
  if (adminCount > 0) {
    return NextResponse.json({ error: '管理者は既に存在します' }, { status: 403 })
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { role: 'admin' },
  })

  return NextResponse.json({ ok: true, message: `${session.user.email} を管理者に設定しました` })
}
