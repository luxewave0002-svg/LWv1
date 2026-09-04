// UnivaPay 連携
//
// 環境変数が揃っていれば実際の API を呼び、無ければ従来どおりモックで動く。
// これにより、鍵を設定するまで本番の挙動は一切変わらない。
//
//   UNIVAPAY_APP_TOKEN   … ストアの JWT
//   UNIVAPAY_APP_SECRET  … ストアのシークレット
//   UNIVAPAY_ENDPOINT    … 省略時 https://api.univapay.com

export type ChargeResult = {
  id: string
  status: 'pending' | 'successful' | 'failed'
  amount: number
  currency: string
  transactionTokenId: string
}

const APP_TOKEN = process.env.UNIVAPAY_APP_TOKEN
const APP_SECRET = process.env.UNIVAPAY_APP_SECRET
const ENDPOINT = process.env.UNIVAPAY_ENDPOINT ?? 'https://api.univapay.com'

/** 実 API を叩ける設定になっているか。false の間はモックで動作する。 */
export function isLiveMode(): boolean {
  return Boolean(APP_TOKEN && APP_SECRET)
}

/**
 * UnivaPay の課金ステータスを、このアプリが扱う3値に寄せる。
 * authorized（与信のみ）は capture 前なので確定扱いにしない。
 */
function mapStatus(status: string): ChargeResult['status'] {
  switch (status) {
    case 'successful':
      return 'successful'
    case 'failed':
    case 'error':
    case 'canceled':
      return 'failed'
    default:
      // pending / awaiting / authorized
      return 'pending'
  }
}

export async function createCharge({
  transactionTokenId,
  amountJpy,
  metadata,
}: {
  transactionTokenId: string
  amountJpy: number
  metadata?: Record<string, string | number>
}): Promise<ChargeResult> {
  if (!isLiveMode()) {
    console.log('Mock charge:', { transactionTokenId, amountJpy, metadata })
    return {
      id: `mock_charge_${Date.now()}`,
      status: 'successful',
      amount: amountJpy,
      currency: 'jpy',
      transactionTokenId,
    }
  }

  // SDK は Node 専用なので、モック時に読み込まれないよう遅延 import する
  const { default: SDK } = await import('univapay-node')
  const sdk = new SDK({ endpoint: ENDPOINT, jwt: APP_TOKEN!, secret: APP_SECRET! })

  const charge = await sdk.charges.create({
    transactionTokenId,
    amount: amountJpy,
    currency: 'JPY',
    metadata,
  })

  // 実運用では作成直後は pending が返り、確定は charge_finished の webhook で受ける
  return {
    id: charge.id,
    status: mapStatus(String(charge.status)),
    amount: amountJpy,
    currency: 'jpy',
    transactionTokenId,
  }
}

/**
 * Webhook の認証。
 *
 * UnivaPay の webhook は登録時に authToken を設定し、配信リクエストでそれを送ってくる方式
 * （SDK の WebHookCreateParams.authToken）。HMAC 署名ではないので、共有シークレットの一致で判定する。
 *
 * UNIVAPAY_WEBHOOK_AUTH_TOKEN が未設定なら検証しない（モック運用時に止めないため）。
 * 設定した場合は一致しないリクエストを拒否する。
 */
export function verifyWebhookAuth(headers: Headers): { ok: true } | { ok: false; reason: string } {
  const expected = process.env.UNIVAPAY_WEBHOOK_AUTH_TOKEN
  if (!expected) return { ok: true }

  const raw =
    headers.get('authorization') ??
    headers.get('x-univapay-auth-token') ??
    headers.get('x-univapay-authorization') ??
    ''
  const presented = raw.replace(/^Bearer\s+/i, '').trim()

  if (!presented) return { ok: false, reason: 'auth token missing' }
  if (!timingSafeEqual(presented, expected)) return { ok: false, reason: 'auth token mismatch' }
  return { ok: true }
}

/** 長さと内容の比較時間を入力に依存させない */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
