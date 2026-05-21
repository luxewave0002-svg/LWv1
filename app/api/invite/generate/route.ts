import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { generateInviteCode } from '@/lib/invite'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const code = await generateInviteCode(session.user.id)
  const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
  return NextResponse.json({ code, url: `${baseUrl}/login?invite=${code}` })
}
