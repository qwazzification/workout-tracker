'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/log', label: 'Log', icon: '➕' },
  { href: '/history', label: 'History', icon: '📋' },
  { href: '/progress', label: 'Progress', icon: '📈' },
  { href: '/routines', label: 'Routines', icon: '📝' },
]

export default function Nav() {
  const pathname = usePathname()

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
      </nav>
    </>
  )
}
