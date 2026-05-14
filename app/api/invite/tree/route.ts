import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getTreeNodes } from '@/lib/invite'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = request.nextUrl.searchParams.get('userId') ?? session.user.id

  // 管理者以外は自分のツリーのみ
  if (userId !== session.user.id && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const data = await getTreeNodes(userId)
  return NextResponse.json(data)
}
