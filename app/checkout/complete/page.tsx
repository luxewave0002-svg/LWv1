'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'

function CompleteView() {
  const searchParams = useSearchParams()
  const purchaseId = searchParams.get('purchaseId')

  return (
    <div className="min-h-screen bg-lw-void flex items-center justify-center text-lw-text-primary">
      <div className="max-w-md text-center space-y-6 bg-lw-surface rounded-2xl p-10 border border-lw-gold/10">
        <div className="w-16 h-16 rounded-full bg-lw-teal-muted/40 border border-lw-teal-mid/50 flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-lw-teal" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h1 className="text-2xl font-display font-light text-lw-teal">購入が完了しました</h1>
        <p className="text-lw-text-secondary text-sm">
          ご購入ありがとうございます。
          <br />
          決済が確認されるとサービスが有効化されます。
        </p>
        {purchaseId && (
          <div className="bg-lw-raised rounded-lg px-4 py-2 text-xs text-lw-text-tertiary font-mono border border-lw-gold/5">
            注文ID: {purchaseId}
          </div>
        )}
        <div className="flex gap-3 justify-center">
          <Link
            href="/partner"
            className="bg-lw-gold hover:bg-lw-gold-mid text-lw-void px-6 py-2.5 rounded-xl font-medium transition-colors"
          >
            ダッシュボードへ
          </Link>
          <Link
            href="/checkout"
            className="border border-lw-gold/15 hover:border-lw-gold/30 text-lw-text-secondary hover:text-lw-text-primary px-6 py-2.5 rounded-xl font-medium transition-colors"
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
    <Suspense fallback={<div className="min-h-screen bg-lw-void" />}>
      <CompleteView />
    </Suspense>
  )
}
