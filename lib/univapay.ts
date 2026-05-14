// UnivaPay モック実装
// 本番では univapay-node SDK の実装に差し替える
// import SDK from 'univapay-node'

export type ChargeResult = {
  id: string
  status: 'pending' | 'successful' | 'failed'
  amount: number
  currency: string
  transactionTokenId: string
}

// モック課金作成
export async function createCharge({
  transactionTokenId,
  amountJpy,
  metadata,
}: {
  transactionTokenId: string
  amountJpy: number
  metadata?: Record<string, string | number>
}): Promise<ChargeResult> {
  // 本番実装:
  // const univapay = new SDK({
  //   endpoint: 'https://api.univapay.com',
  //   jwt: process.env.UNIVAPAY_APP_TOKEN!,
  //   secret: process.env.UNIVAPAY_APP_SECRET!,
  // })
  // return await univapay.charges.create({
  //   transactionTokenId,
  //   amount: amountJpy,
  //   currency: 'jpy',
  //   metadata,
  // })

  console.log('Mock charge:', { transactionTokenId, amountJpy, metadata })
  return {
    id: `mock_charge_${Date.now()}`,
    status: 'successful',
    amount: amountJpy,
    currency: 'jpy',
    transactionTokenId,
  }
}
