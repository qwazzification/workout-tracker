'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

const links = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/log', label: 'Log', icon: '➕' },
  { href: '/history', label: 'History', icon: '📋' },
  { href: '/progress', label: 'Progress', icon: '📈' },
  { href: '/routines', label: 'Routines', icon: '📝' },
]

export default function Nav({ user }: { user: User }) {
  const pathname = usePathname()
  const router = useRouter()

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden md:flex flex-col w-52 min-h-screen bg-gray-900 text-white p-4 gap-1 shrink-0">
        <div className="text-lg font-bold mb-8 px-2 text-white">WorkoutTracker</div>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              pathname === link.href
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-800'
            }`}
          >
            <span>{link.icon}</span>
            {link.label}
          </Link>
        ))}
        <div className="mt-auto pt-4 border-t border-gray-700">
          <p className="text-xs text-gray-400 px-2 mb-2 truncate">{user.email}</p>
          <button
            onClick={signOut}
            className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Mobile bottom navigation bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-900 flex border-t border-gray-700 z-50">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`flex flex-col items-center justify-center flex-1 py-2 text-xs gap-0.5 transition-colors ${
              pathname === link.href ? 'text-blue-400' : 'text-gray-400'
            }`}
          >
            <span className="text-xl">{link.icon}</span>
            {link.label}
          </Link>
        ))}
        <button
          onClick={signOut}
          className="flex flex-col items-center justify-center flex-1 py-2 text-xs gap-0.5 text-gray-400 hover:text-gray-200 transition-colors"
        >
          <span className="text-xl">👤</span>
          Sign out
        </button>
      </nav>
    </>
  )
}
