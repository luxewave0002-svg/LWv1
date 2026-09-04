import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'ログインしてください' }, { status: 401 })
  }

  const { currentPassword, newPassword } = await request.json()

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: '現在のパスワードと新しいパスワードを入力してください' }, { status: 400 })
  }
  // 登録時と同じ下限に揃える（app/api/register/route.ts）
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return NextResponse.json({ error: '新しいパスワードは8文字以上にしてください' }, { status: 400 })
  }
  if (currentPassword === newPassword) {
    return NextResponse.json({ error: '現在のパスワードと同じです' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { password: true },
  })

  // Google のみで作られたアカウントにはパスワードが無いので、ここでは変更できない
  if (!user?.password) {
    return NextResponse.json(
      { error: 'このアカウントにはパスワードが設定されていません' },
      { status: 400 }
    )
  }

  const valid = await bcrypt.compare(currentPassword, user.password)
  if (!valid) {
    return NextResponse.json({ error: '現在のパスワードが正しくありません' }, { status: 403 })
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { password: await bcrypt.hash(newPassword, 10) },
  })

  return NextResponse.json({ ok: true })
}
