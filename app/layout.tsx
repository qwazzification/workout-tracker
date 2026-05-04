import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import AuthGuard from '@/components/AuthGuard'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Workout Tracker',
  description: 'Track your workouts and progress',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 min-h-screen`}>
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  )
}
