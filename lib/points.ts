import { prisma } from './prisma'

// ─────────────────────────────────────────
// 紹介ポイントの付与ルール
// ─────────────────────────────────────────
/** 被紹介者が無料登録を完了したとき、紹介者に入るポイント */
export const REFERRAL_SIGNUP_POINTS = 5
/** 被紹介者が有料プランに加入したとき、紹介者に追加で入るポイント（合算 20pt） */
export const REFERRAL_PURCHASE_POINTS = 15

export const POINT_TYPE = {
  referralSignup: 'referral_signup',
  referralPurchase: 'referral_purchase',
} as const

export type PointType = (typeof POINT_TYPE)[keyof typeof POINT_TYPE]

/** 被紹介者1人につき1回だけ成立するイベントキー */
export function referralSignupEventKey(inviteeId: string) {
  return `${POINT_TYPE.referralSignup}:${inviteeId}`
}
export function referralPurchaseEventKey(inviteeId: string) {
  return `${POINT_TYPE.referralPurchase}:${inviteeId}`
}

export type GrantResult =
  | { granted: true; amount: number; balance: number }
  | { granted: false; reason: 'already_granted' | 'no_referrer' | 'self_referral' | 'purchase_not_found' | 'not_paid' }

/** Prisma の一意制約違反（同時実行で eventKey が衝突したケース） */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
}

/**
 * ポイントを付与する。eventKey が同じ付与は二度目以降スキップされる。
 *
 * 台帳への挿入と残高更新は同一トランザクションで行うので、両者がずれることはない。
 * 事前チェックをすり抜けた同時リクエストは eventKey の UNIQUE 制約で弾かれ、
 * こちらも「付与済み」として正常扱いする。
 */
export async function grantPoints(params: {
  userId: string
  amount: number
  type: PointType
  eventKey: string
  sourceUserId?: string | null
  description?: string
}): Promise<GrantResult> {
  const { userId, amount, type, eventKey, sourceUserId, description } = params

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.pointTransaction.findUnique({
        where: { eventKey },
        select: { id: true },
      })
      if (existing) return { granted: false, reason: 'already_granted' } as const

      await tx.pointTransaction.create({
        data: { userId, sourceUserId: sourceUserId ?? null, amount, type, eventKey, description },
      })

      const user = await tx.user.update({
        where: { id: userId },
        data: { points: { increment: amount } },
        select: { points: true },
      })

      return { granted: true, amount, balance: user.points } as const
    })
  } catch (error) {
    if (isUniqueViolation(error)) return { granted: false, reason: 'already_granted' }
    throw error
  }
}

/**
 * 無料登録の成立 → 紹介者に 5pt。
 * 登録処理から呼ぶ。招待コードなし（マスターコード経由など）の場合は何もしない。
 */
export async function grantReferralSignupPoints(invitee: {
  id: string
  name?: string | null
  referrerId: string | null
}): Promise<GrantResult> {
  if (!invitee.referrerId) return { granted: false, reason: 'no_referrer' }
  if (invitee.referrerId === invitee.id) return { granted: false, reason: 'self_referral' }

  return grantPoints({
    userId: invitee.referrerId,
    amount: REFERRAL_SIGNUP_POINTS,
    type: POINT_TYPE.referralSignup,
    eventKey: referralSignupEventKey(invitee.id),
    sourceUserId: invitee.id,
    description: `紹介成立（無料登録）: ${invitee.name ?? invitee.id}`,
  })
}

/**
 * 有料プラン加入の成立 → 紹介者に 15pt。
 * 決済確定側（charge / webhook）から purchaseId で呼ぶ。
 * 支払い済みであることを DB 側の状態から読み直して確認するので、呼び出し元を信用しない。
 */
export async function grantReferralPurchasePoints(purchaseId: string): Promise<GrantResult> {
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    select: {
      status: true,
      plan: { select: { name: true } },
      user: { select: { id: true, name: true, referrerId: true } },
    },
  })

  if (!purchase) return { granted: false, reason: 'purchase_not_found' }
  if (purchase.status !== 'paid') return { granted: false, reason: 'not_paid' }

  const invitee = purchase.user
  if (!invitee.referrerId) return { granted: false, reason: 'no_referrer' }
  if (invitee.referrerId === invitee.id) return { granted: false, reason: 'self_referral' }

  return grantPoints({
    userId: invitee.referrerId,
    amount: REFERRAL_PURCHASE_POINTS,
    type: POINT_TYPE.referralPurchase,
    // 被紹介者ごとに1回。2つ目のプランを買っても再付与しない。
    eventKey: referralPurchaseEventKey(invitee.id),
    sourceUserId: invitee.id,
    description: `紹介成立（有料プラン加入 / ${purchase.plan.name}）: ${invitee.name ?? invitee.id}`,
  })
}

/**
 * ポイント付与は登録・決済の本処理に対して従属的な処理なので、
 * ここで落ちても呼び出し元のレスポンスは壊さない。失敗はログに残して後追いできるようにする。
 */
export async function grantPointsSafely(
  label: string,
  run: () => Promise<GrantResult>
): Promise<GrantResult | null> {
  try {
    return await run()
  } catch (error) {
    console.error(`[points] ${label} failed:`, error)
    return null
  }
}

// ─────────────────────────────────────────
// 既存データへの遡及付与（バックフィル）
//
// 通常の付与と同じ eventKey を使うので、何度実行しても結果は変わらない。
// 稼働後に走らせても、既に付与済みのユーザーは自動的にスキップされる。
// ─────────────────────────────────────────
export type BackfillSummary = {
  dryRun: boolean
  scannedInvitees: number
  hasMore: boolean
  signup: { granted: number; skipped: number; points: number }
  purchase: { granted: number; skipped: number; points: number }
  totalPointsGranted: number
  errors: { inviteeId: string; stage: 'signup' | 'purchase'; message: string }[]
}

export async function backfillReferralPoints(
  options: { dryRun?: boolean; limit?: number } = {}
): Promise<BackfillSummary> {
  const dryRun = options.dryRun ?? true
  const limit = options.limit ?? 1000

  // 紹介者がいるユーザーだけが対象。有料転換の判定は paid な購入の有無で行う。
  const invitees = await prisma.user.findMany({
    where: { referrerId: { not: null } },
    select: {
      id: true,
      name: true,
      referrerId: true,
      purchases: {
        where: { status: 'paid' },
        select: { id: true },
        orderBy: { paidAt: 'asc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })

  const summary: BackfillSummary = {
    dryRun,
    scannedInvitees: invitees.length,
    hasMore: invitees.length === limit,
    signup: { granted: 0, skipped: 0, points: 0 },
    purchase: { granted: 0, skipped: 0, points: 0 },
    totalPointsGranted: 0,
    errors: [],
  }

  if (dryRun) {
    // 付与済みの eventKey をまとめて引き、これから入る分だけを数える
    const keys = invitees.flatMap((invitee) => [
      referralSignupEventKey(invitee.id),
      ...(invitee.purchases.length > 0 ? [referralPurchaseEventKey(invitee.id)] : []),
    ])
    const existing = await prisma.pointTransaction.findMany({
      where: { eventKey: { in: keys } },
      select: { eventKey: true },
    })
    const done = new Set(existing.map((row) => row.eventKey))

    for (const invitee of invitees) {
      const self = invitee.referrerId === invitee.id
      if (!self && !done.has(referralSignupEventKey(invitee.id))) {
        summary.signup.granted += 1
        summary.signup.points += REFERRAL_SIGNUP_POINTS
      } else {
        summary.signup.skipped += 1
      }

      if (invitee.purchases.length > 0) {
        if (!self && !done.has(referralPurchaseEventKey(invitee.id))) {
          summary.purchase.granted += 1
          summary.purchase.points += REFERRAL_PURCHASE_POINTS
        } else {
          summary.purchase.skipped += 1
        }
      }
    }

    summary.totalPointsGranted = summary.signup.points + summary.purchase.points
    return summary
  }

  // 1件ずつ通常の付与関数を通す。判定ルールを二重に書かないため、
  // また1件の失敗で全体を止めないため、逐次実行＋個別 catch にしている。
  for (const invitee of invitees) {
    try {
      const result = await grantReferralSignupPoints(invitee)
      if (result.granted) {
        summary.signup.granted += 1
        summary.signup.points += result.amount
      } else {
        summary.signup.skipped += 1
      }
    } catch (error) {
      summary.errors.push({
        inviteeId: invitee.id,
        stage: 'signup',
        message: error instanceof Error ? error.message : String(error),
      })
    }

    const paidPurchase = invitee.purchases[0]
    if (paidPurchase) {
      try {
        const result = await grantReferralPurchasePoints(paidPurchase.id)
        if (result.granted) {
          summary.purchase.granted += 1
          summary.purchase.points += result.amount
        } else {
          summary.purchase.skipped += 1
        }
      } catch (error) {
        summary.errors.push({
          inviteeId: invitee.id,
          stage: 'purchase',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  summary.totalPointsGranted = summary.signup.points + summary.purchase.points
  return summary
}

/**
 * 有料加入ポイントの取り消し。
 *
 * 管理画面で「決済済」を取り消したときに使う。台帳の該当行を削除して残高を戻すので、
 * 「残高 = 台帳の合計」という不変条件は保たれ、再度決済済にすれば改めて付与される。
 *
 * 同じ被紹介者に他の支払い済み購入が残っている場合は取り消さない
 * （eventKey は購入単位ではなく被紹介者単位のため）。
 */
export async function revokeReferralPurchasePoints(
  purchaseId: string
): Promise<{ revoked: boolean; reason?: string; amount?: number }> {
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    select: { user: { select: { id: true, referrerId: true } } },
  })
  if (!purchase) return { revoked: false, reason: 'purchase_not_found' }
  if (!purchase.user.referrerId) return { revoked: false, reason: 'no_referrer' }

  const stillPaid = await prisma.purchase.count({
    where: { userId: purchase.user.id, status: 'paid' },
  })
  if (stillPaid > 0) return { revoked: false, reason: 'still_has_paid_purchase' }

  const eventKey = referralPurchaseEventKey(purchase.user.id)

  return await prisma.$transaction(async (tx) => {
    const entry = await tx.pointTransaction.findUnique({
      where: { eventKey },
      select: { id: true, userId: true, amount: true },
    })
    if (!entry) return { revoked: false, reason: 'not_granted' }

    await tx.pointTransaction.delete({ where: { id: entry.id } })
    await tx.user.update({
      where: { id: entry.userId },
      data: { points: { decrement: entry.amount } },
    })
    return { revoked: true, amount: entry.amount }
  })
}
