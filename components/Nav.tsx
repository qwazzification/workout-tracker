'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

const navLinks = [
  { href: '/', label: 'Feed', icon: '🏠' },
  { href: '/workout', label: 'Workout', icon: '💪' },
  { href: '/progress', label: 'Profile', icon: '👤' },
]

export default function Nav({ user }: { user: User }) {
  const pathname = usePathname()

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden md:flex flex-col w-52 h-screen sticky top-0 overflow-y-auto bg-gray-900 dark:bg-gray-950 text-white p-4 gap-1 shrink-0 border-r border-gray-800 dark:border-gray-900">
        <div className="text-lg font-bold mb-8 px-2 text-white">WorkoutTracker</div>
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              pathname === link.href
                ? 'bg-brand-700 text-white'
                : 'text-gray-300 hover:bg-gray-800 dark:hover:bg-gray-800'
            }`}
          >
            <span>{link.icon}</span>
            {link.label}
          </Link>
        ))}
        <div className="mt-auto pt-4 border-t border-gray-700">
          <p className="text-xs text-gray-400 px-2 truncate">{user.email}</p>
        </div>
      </nav>

      {/* Mobile bottom navigation bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-900 dark:bg-gray-950 flex border-t border-gray-700 dark:border-gray-800 z-50">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`flex flex-col items-center justify-center flex-1 py-2 text-xs gap-0.5 transition-colors ${
              pathname === link.href ? 'text-brand-400' : 'text-gray-400'
            }`}
          >
            <span className="text-xl">{link.icon}</span>
            {link.label}
          </Link>
        ))}
      </nav>
    </>
  )
}
