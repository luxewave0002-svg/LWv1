import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { customAlphabet } from 'nanoid'

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8)

export async function POST(request: NextRequest) {
  const { name, email, password, inviteCode } = await request.json()

  if (!name || !email || !password) {
    return NextResponse.json({ error: '名前・メール・パスワードは必須です' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'パスワードは8文字以上にしてください' }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'このメールアドレスは既に登録されています' }, { status: 409 })
  }

  let referrerId: string | undefined
  if (inviteCode) {
    const inviteLog = await prisma.inviteLog.findUnique({ where: { inviteCode } })
    if (inviteLog && !inviteLog.inviteeId) {
      referrerId = inviteLog.inviterId
    }
  }

  const hashed = await bcrypt.hash(password, 10)

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      referralCode: nanoid(),
      referrerId,
    },
  })

  if (inviteCode && referrerId) {
    await prisma.inviteLog.update({
      where: { inviteCode },
      data: { inviteeId: user.id, joinedAt: new Date() },
    })
  }

  return NextResponse.json({ ok: true })
}
