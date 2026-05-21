'use client'

import { signOut } from 'next-auth/react'

export function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="w-full text-left px-3 py-2 rounded-lg text-gray-500 hover:bg-white/10 hover:text-gray-300 transition-colors text-sm"
    >
      ログアウト
    </button>
  )
}
