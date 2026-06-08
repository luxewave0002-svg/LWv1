'use client'

import { signOut } from 'next-auth/react'

export function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="w-full text-left px-3 py-2 rounded-lg text-lw-text-tertiary hover:bg-lw-gold/10 hover:text-lw-text-secondary transition-colors text-sm"
    >
      ログアウト
    </button>
  )
}
