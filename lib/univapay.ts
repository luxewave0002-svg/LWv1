// UnivaPay 連携
//
// 運用は「URL決済」— 決済は UnivaPay がホストするページで完結するため、
// このアプリから課金APIを呼ぶことはない。App Token / Secret は不要。
// 入金の確定は webhook（自動）か、管理画面での手動切り替えで反映する。

/**
 * Webhook の認証。
 *
 * UnivaPay の webhook は登録時に authToken を設定し、配信リクエストでそれを送ってくる方式
 * （SDK の WebHookCreateParams.authToken）。HMAC 署名ではないので、共有シークレットの一致で判定する。
 *
 * UNIVAPAY_WEBHOOK_AUTH_TOKEN が未設定なら検証しない。
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
