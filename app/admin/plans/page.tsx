'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'

type Plan = {
  id: string
  name: string
  description: string | null
  priceJpy: number
  billingType: string
  isActive: boolean
  createdAt: string
  _count: { purchases: number }
}

const BILLING_LABEL: Record<string, string> = {
  one_time: '買い切り',
  monthly: '月額',
  yearly: '年額',
}

type Draft = {
  id?: string
  name: string
  description: string
  priceJpy: string
  billingType: string
}

const EMPTY_DRAFT: Draft = { name: '', description: '', priceJpy: '', billingType: 'monthly' }

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<Plan | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    const res = await fetch('/api/admin/plans')
    const data = await res.json()
    if (Array.isArray(data)) setPlans(data)
    setLoading(false)
  }

  // 初回取得は既存の管理画面と同じ書き方に揃える（load() は保存・削除後の再取得用）
  useEffect(() => {
    fetch('/api/admin/plans')
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setPlans(data))
      .finally(() => setLoading(false))
  }, [])

  async function save() {
    if (!draft) return
    setSaving(true)
    setError('')
    const editing = Boolean(draft.id)
    const res = await fetch('/api/admin/plans', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: draft.id,
        name: draft.name,
        description: draft.description,
        priceJpy: Number(draft.priceJpy),
        billingType: draft.billingType,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? '保存に失敗しました')
    } else {
      setDraft(null)
      await load()
    }
    setSaving(false)
  }

  async function toggleActive(plan: Plan) {
    await fetch('/api/admin/plans', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: plan.id, isActive: !plan.isActive }),
    })
    setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, isActive: !p.isActive } : p)))
  }

  async function remove(plan: Plan) {
    setDeleting(true)
    setError('')
    const res = await fetch('/api/admin/plans', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: plan.id }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? '削除に失敗しました')
      setConfirmDelete(null)
    } else {
      setConfirmDelete(null)
      await load()
    }
    setDeleting(false)
  }

  const activeCount = plans.filter((p) => p.isActive).length

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-light text-lw-text-primary">プラン管理</h1>
          <p className="text-lw-text-tertiary text-sm mt-1">
            全 {plans.length} 件（有効 <span className="text-lw-gold">{activeCount}</span> 件）
          </p>
        </div>
        <button
          onClick={() => { setDraft({ ...EMPTY_DRAFT }); setError('') }}
          className="bg-lw-gold hover:bg-lw-gold-mid text-lw-void px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          ＋ 新規プラン
        </button>
      </div>

      {error && !draft && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {plans.length === 0 && !loading && (
        <div className="bg-lw-raised/50 border border-lw-gold/10 rounded-xl px-4 py-3 text-lw-text-secondary text-sm">
          プランが1件もないため、購入画面（/checkout）は「利用可能なプランがありません」と表示されます。
          プランを登録すると購入できるようになり、紹介者への有料加入ポイント（15pt）も発生するようになります。
        </div>
      )}

      <div className="bg-lw-surface rounded-2xl border border-lw-gold/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-lw-gold/10 bg-lw-raised/50">
            <tr className="text-lw-text-secondary">
              <th className="text-left px-4 py-3 font-medium">プラン名</th>
              <th className="text-left px-4 py-3 font-medium">金額</th>
              <th className="text-left px-4 py-3 font-medium">課金種別</th>
              <th className="text-left px-4 py-3 font-medium">状態</th>
              <th className="text-left px-4 py-3 font-medium">購入数</th>
              <th className="text-left px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-lw-text-tertiary">読み込み中...</td></tr>
            ) : plans.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-lw-text-tertiary">プランがありません</td></tr>
            ) : (
              plans.map((p) => (
                <tr key={p.id} className={`border-b border-lw-gold/5 hover:bg-lw-gold/[0.03] transition-colors ${p.isActive ? '' : 'opacity-50'}`}>
                  <td className="px-4 py-3">
                    <div className="text-lw-text-primary font-medium">{p.name}</div>
                    {p.description && <div className="text-lw-text-tertiary text-xs mt-0.5">{p.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-lw-gold">¥{p.priceJpy.toLocaleString()}</td>
                  <td className="px-4 py-3 text-lw-text-secondary">{BILLING_LABEL[p.billingType] ?? p.billingType}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
                      p.isActive
                        ? 'bg-lw-teal-muted/40 text-lw-teal border-lw-teal-mid/50'
                        : 'bg-lw-raised text-lw-text-tertiary border-lw-gold/10'
                    }`}>
                      {p.isActive ? '公開中' : '停止中'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-lw-text-secondary">{p._count.purchases} 件</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          setError('')
                          setDraft({
                            id: p.id,
                            name: p.name,
                            description: p.description ?? '',
                            priceJpy: String(p.priceJpy),
                            billingType: p.billingType,
                          })
                        }}
                        className="text-xs text-lw-gold hover:text-lw-gold-mid transition-colors"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => toggleActive(p)}
                        className="text-xs text-lw-text-secondary hover:text-lw-text-primary transition-colors"
                      >
                        {p.isActive ? '停止' : '公開'}
                      </button>
                      <button
                        onClick={() => { setError(''); setConfirmDelete(p) }}
                        className="text-xs text-red-500 hover:text-red-400 transition-colors"
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 作成・編集モーダル */}
      {draft && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-lw-surface border border-lw-gold/10 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lw-text-primary font-bold text-lg">
              {draft.id ? 'プランを編集' : '新規プラン'}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-lw-text-secondary mb-1.5">プラン名</label>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="スタンダードプラン"
                  className="w-full bg-lw-raised border border-lw-gold/15 rounded-lg px-3 py-2.5 text-lw-text-primary placeholder:text-lw-text-tertiary focus:outline-none focus:border-lw-gold-muted transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-lw-text-secondary mb-1.5">説明（任意）</label>
                <input
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className="w-full bg-lw-raised border border-lw-gold/15 rounded-lg px-3 py-2.5 text-lw-text-primary placeholder:text-lw-text-tertiary focus:outline-none focus:border-lw-gold-muted transition-colors"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-lw-text-secondary mb-1.5">金額（円）</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={draft.priceJpy}
                    onChange={(e) => setDraft({ ...draft, priceJpy: e.target.value })}
                    placeholder="9800"
                    className="w-full bg-lw-raised border border-lw-gold/15 rounded-lg px-3 py-2.5 text-lw-text-primary placeholder:text-lw-text-tertiary focus:outline-none focus:border-lw-gold-muted transition-colors"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-lw-text-secondary mb-1.5">課金種別</label>
                  <select
                    value={draft.billingType}
                    onChange={(e) => setDraft({ ...draft, billingType: e.target.value })}
                    className="w-full bg-lw-raised border border-lw-gold/15 rounded-lg px-3 py-2.5 text-lw-text-primary focus:outline-none focus:border-lw-gold-muted transition-colors"
                  >
                    {Object.entries(BILLING_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setDraft(null); setError('') }}
                className="flex-1 py-2 rounded-lg border border-lw-gold/15 text-lw-text-secondary hover:border-lw-gold/30 hover:text-lw-text-primary transition-colors text-sm"
              >
                キャンセル
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 py-2 rounded-lg bg-lw-gold hover:bg-lw-gold-mid disabled:opacity-50 text-lw-void font-semibold transition-colors text-sm"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 削除確認モーダル */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-lw-surface border border-lw-gold/10 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lw-text-primary font-bold text-lg">プランを削除しますか？</h2>
            <div className="bg-lw-raised rounded-xl p-4 text-sm space-y-1">
              <div className="text-lw-text-primary">{confirmDelete.name}</div>
              <div className="text-lw-text-secondary">
                ¥{confirmDelete.priceJpy.toLocaleString()} / {BILLING_LABEL[confirmDelete.billingType] ?? confirmDelete.billingType}
              </div>
            </div>
            <p className="text-lw-text-tertiary text-sm">
              購入履歴があるプランは削除できません。その場合は「停止」で非表示にしてください。
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2 rounded-lg border border-lw-gold/15 text-lw-text-secondary hover:border-lw-gold/30 hover:text-lw-text-primary transition-colors text-sm"
              >
                キャンセル
              </button>
              <button
                onClick={() => remove(confirmDelete)}
                disabled={deleting}
                className="flex-1 py-2 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white font-semibold transition-colors text-sm"
              >
                {deleting ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
