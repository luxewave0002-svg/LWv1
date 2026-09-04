import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { customAlphabet } from 'nanoid'
import { grantPointsSafely, grantReferralSignupPoints } from '@/lib/points'

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8)

// Master access code — valid even without a matching InviteLog/User
const MASTER_CODES = new Set([
  process.env.INVITE_MASTER_CODE ?? 'LWPTNR001',
])

export async function POST(request: NextRequest) {
  const { name, email, password, inviteCode } = await request.json()

  if (!name || !email || !password) {
    return NextResponse.json({ error: '名前・メール・パスワードは必須です' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'パスワードは8文字以上にしてください' }, { status: 400 })
  }
  if (!inviteCode) {
    return NextResponse.json({ error: '招待コードは必須です' }, { status: 400 })
  }

  const hashed = await bcrypt.hash(password, 10)

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    if (existing.password) {
      return NextResponse.json({ error: 'このメールアドレスは既に登録されています' }, { status: 409 })
    }
    // Account without password (OAuth stub) → set password
    await prisma.user.update({ where: { email }, data: { name, password: hashed } })
    return NextResponse.json({ ok: true })
  }

  // Resolve invite code → referrerId
  let referrerId: string | undefined
  let resolvedInviteCode: string | undefined

  if (MASTER_CODES.has(inviteCode.trim().toUpperCase())) {
    // Master code: no referrer, always valid
  } else {
    // Try one-time InviteLog code
    const inviteLog = await prisma.inviteLog.findUnique({ where: { inviteCode } })
    if (inviteLog && !inviteLog.inviteeId) {
      referrerId = inviteLog.inviterId
      resolvedInviteCode = inviteCode
    } else {
      // Try permanent referralCode
      const referrer = await prisma.user.findUnique({ where: { referralCode: inviteCode } })
      if (referrer) {
        referrerId = referrer.id
      } else {
        return NextResponse.json({ error: '招待コードが無効です' }, { status: 400 })
      }
    }
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      referralCode: nanoid(),
      referrerId,
    },
  })

  if (resolvedInviteCode) {
    await prisma.inviteLog.update({
      where: { inviteCode: resolvedInviteCode },
      data: { inviteeId: user.id, joinedAt: new Date() },
    })
  }

  // 無料登録の成立 → 紹介者に 5pt（招待コード経由で referrerId が付いた場合のみ）
  await grantPointsSafely(`referral signup for user ${user.id}`, () =>
    grantReferralSignupPoints(user)
  )

  return NextResponse.json({ ok: true })
}
