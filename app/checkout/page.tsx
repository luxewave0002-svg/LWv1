'use client'

export const dynamic = 'force-dynamic'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type Plan = {
  id: string
  name: string
  description: string | null
  priceJpy: number
  billingType: string
}

const BILLING_LABEL: Record<string, string> = {
  one_time: '買い切り',
  monthly: '月額',
  yearly: '年額',
}

export default function CheckoutPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [plans, setPlans] = useState<Plan[]>([])
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    fetch('/api/plans')
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setPlans(data))
  }, [])

  async function handlePurchase() {
    if (!selectedPlan || !session) return
    setProcessing(true)
    setError('')

    try {
      // モック: transactionTokenId を生成
      const mockTokenId = `mock_token_${Date.now()}`

      const res = await fetch('/api/univapay/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionTokenId: mockTokenId,
          planId: selectedPlan.id,
        }),
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error ?? '決済に失敗しました')

      router.push(`/checkout/complete?purchaseId=${data.purchaseId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '決済に失敗しました')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-violet-400">プランを選択</h1>

        {/* プラン一覧 */}
        <div className="space-y-3">
          {plans.length === 0 && (
            <div className="bg-[#1a1a2e] rounded-2xl p-8 text-center text-gray-500 border border-white/10">
              利用可能なプランがありません
            </div>
          )}
          {plans.map((plan) => (
            <button
              key={plan.id}
              onClick={() => setSelectedPlan(plan)}
              className={`w-full text-left bg-[#1a1a2e] rounded-2xl p-5 border-2 transition-all ${
                selectedPlan?.id === plan.id
                  ? 'border-violet-500 shadow-lg shadow-violet-500/20'
                  : 'border-white/10 hover:border-white/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-lg text-white">{plan.name}</div>
                  {plan.description && (
                    <div className="text-gray-400 text-sm mt-1">{plan.description}</div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">
                    {BILLING_LABEL[plan.billingType] ?? plan.billingType}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-violet-400">
                    ¥{plan.priceJpy.toLocaleString()}
                  </div>
                  {selectedPlan?.id === plan.id && (
                    <div className="text-xs text-violet-400 mt-1">✓ 選択中</div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* UnivaPay ウィジェット（本番用コメントアウト） */}
        {/* 本番実装では以下のScript + ウィジェット埋め込みを使用:
        <Script src="https://widget.univapay.com/client/checkout.js" strategy="afterInteractive" />
        <div id="univapay-widget" data-app-id={process.env.NEXT_PUBLIC_UNIVAPAY_APP_ID} ... />
        */}

        {selectedPlan && (
          <div className="bg-[#1a1a2e] rounded-2xl p-6 border border-violet-500/30">
            <h2 className="font-semibold text-gray-300 mb-4">お支払い確認</h2>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-400">プラン</span>
              <span className="text-white">{selectedPlan.name}</span>
            </div>
            <div className="flex justify-between mb-6">
              <span className="text-gray-400">金額</span>
              <span className="text-violet-400 font-bold text-xl">
                ¥{selectedPlan.priceJpy.toLocaleString()}
              </span>
            </div>

            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

            <button
              onClick={handlePurchase}
              disabled={processing}
              className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {processing ? '処理中...' : '購入する（モック）'}
            </button>
            <p className="text-xs text-gray-500 text-center mt-3">
              ※ 現在はモック決済です。UnivaPayトークン取得後に本番実装に切り替えます。
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
