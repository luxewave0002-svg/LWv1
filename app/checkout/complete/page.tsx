'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'

function CompleteView() {
  const searchParams = useSearchParams()
  const purchaseId = searchParams.get('purchaseId')

  return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center text-white">
      <div className="max-w-md text-center space-y-6 bg-[#1a1a2e] rounded-2xl p-10 border border-white/10">
        <div className="w-16 h-16 rounded-full bg-emerald-900/50 border border-emerald-700 flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-emerald-400">購入が完了しました</h1>
        <p className="text-gray-400 text-sm">
          ご購入ありがとうございます。
          <br />
          決済が確認されるとサービスが有効化されます。
        </p>
        {purchaseId && (
          <div className="bg-[#0f0f1a] rounded-lg px-4 py-2 text-xs text-gray-500 font-mono">
            注文ID: {purchaseId}
          </div>
        )}
        <div className="flex gap-3 justify-center">
          <Link
            href="/partner"
            className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-2.5 rounded-xl font-medium transition-colors"
          >
            ダッシュボードへ
          </Link>
          <Link
            href="/checkout"
            className="bg-white/10 hover:bg-white/20 text-white px-6 py-2.5 rounded-xl font-medium transition-colors"
          >
            他のプランを見る
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function CompletePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0f0f1a]" />}>
      <CompleteView />
    </Suspense>
  )
}
