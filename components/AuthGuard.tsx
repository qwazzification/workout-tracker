'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import type { User } from '@supabase/supabase-js'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      setLoading(false)
      if (!u && pathname !== '/login') router.replace('/login')
      if (u && pathname === '/login') router.replace('/')
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (!u && pathname !== '/login') router.replace('/login')
      if (u && pathname === '/login') router.replace('/')
    })

    return () => subscription.unsubscribe()
  }, [pathname, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-400 dark:text-gray-500 text-sm">Loading...</div>
      </div>
    )
  }

  if (pathname === '/login') return <>{children}</>

  if (!user) return null

  return (
    <div className="flex min-h-screen items-start bg-gray-50 dark:bg-gray-900">
      <Nav user={user} />
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 max-w-3xl w-full">
        {children}
      </main>
    </div>
  )
}
