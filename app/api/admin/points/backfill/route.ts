import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { backfillReferralPoints } from '@/lib/points'

// 件数が多いと時間がかかるため、実行時間の上限を引き上げる（Vercel Hobby は 60 秒が上限）
export const maxDuration = 60

async function requireAdmin() {
  const session = await auth()
  if (session?.user?.role !== 'admin') return null
  return session
}

/**
 * 遡及付与の実行内容を確認する（DBは変更しない）。
 */
export async function GET(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const limit = Number(request.nextUrl.searchParams.get('limit') ?? 1000)
  const summary = await backfillReferralPoints({ dryRun: true, limit })
  return NextResponse.json(summary)
}

/**
 * 遡及付与を実行する。
 * 実際に書き込むには body で明示的に { "dryRun": false } を渡す必要がある
 * （うっかり叩いても既定では何も変更されない）。
 * 冪等なので、途中で打ち切られても同じリクエストを再送すれば続きから埋まる。
 */
export async function POST(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { dryRun?: boolean; limit?: number } = {}
  try {
    body = await request.json()
  } catch {
    // ボディなしはドライラン扱い
  }

  const dryRun = body.dryRun !== false
  const summary = await backfillReferralPoints({ dryRun, limit: body.limit })

  return NextResponse.json({
    ...summary,
    message: dryRun
      ? 'ドライランです。実際に付与するには {"dryRun": false} を指定してください。'
      : `遡及付与を実行しました（合計 ${summary.totalPointsGranted}pt）。`,
  })
}
