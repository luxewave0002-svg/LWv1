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
      // 「未決済」の購入記録を作ってから UnivaPay の決済ページへ送る
      const res = await fetch('/api/checkout/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: selectedPlan.id }),
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error ?? '決済ページを開けませんでした')

      // 決済は UnivaPay 側で完結する。入金確定は webhook か管理画面の操作で反映される。
      window.location.href = data.paymentUrl
    } catch (e) {
      setError(e instanceof Error ? e.message : '決済ページを開けませんでした')
      setProcessing(false)
    }
  }

  return (
    <div className="min-h-screen bg-lw-void text-lw-text-primary p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-3xl font-display font-light text-lw-gold">プランを選択</h1>

        {/* プラン一覧 */}
        <div className="space-y-3">
          {plans.length === 0 && (
            <div className="bg-lw-surface rounded-2xl p-8 text-center text-lw-text-tertiary border border-lw-gold/10">
              利用可能なプランがありません
            </div>
          )}
          {plans.map((plan) => (
            <button
              key={plan.id}
              onClick={() => setSelectedPlan(plan)}
              className={`w-full text-left bg-lw-surface rounded-2xl p-5 border-2 transition-all ${
                selectedPlan?.id === plan.id
                  ? 'border-lw-gold shadow-lg'
                  : 'border-lw-gold/10 hover:border-lw-gold/25'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-lg text-lw-text-primary">{plan.name}</div>
                  {plan.description && (
                    <div className="text-lw-text-secondary text-sm mt-1">{plan.description}</div>
                  )}
                  <div className="text-xs text-lw-text-tertiary mt-1">
                    {BILLING_LABEL[plan.billingType] ?? plan.billingType}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-sans font-light tracking-tight text-lw-gold">
                    ¥{plan.priceJpy.toLocaleString()}
                  </div>
                  {selectedPlan?.id === plan.id && (
                    <div className="text-xs text-lw-gold mt-1">✓ 選択中</div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        {selectedPlan && (
          <div className="bg-lw-surface rounded-2xl p-6 border border-lw-gold/30">
            <h2 className="text-sm font-medium text-lw-text-secondary mb-4 tracking-[0.04em]">お支払い確認</h2>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-lw-text-secondary">プラン</span>
              <span className="text-lw-text-primary">{selectedPlan.name}</span>
            </div>
            <div className="flex justify-between mb-6">
              <span className="text-lw-text-secondary">金額</span>
              <span className="text-lw-gold font-sans font-light tracking-tight text-2xl">
                ¥{selectedPlan.priceJpy.toLocaleString()}
              </span>
            </div>

            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

            <button
              onClick={handlePurchase}
              disabled={processing}
              className="w-full bg-lw-gold hover:bg-lw-gold-mid disabled:opacity-50 text-lw-void font-semibold py-3 rounded-xl transition-colors"
            >
              {processing ? '処理中...' : '購入する（モック）'}
            </button>
            <p className="text-xs text-lw-text-tertiary text-center mt-3">
              ※ 現在はモック決済です。UnivaPayトークン取得後に本番実装に切り替えます。
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
