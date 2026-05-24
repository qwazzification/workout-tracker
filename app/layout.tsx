import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import AuthGuard from '@/components/AuthGuard'
import ThemeProvider from '@/components/ThemeProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Workout Tracker',
  description: 'Track your workouts and progress',
}

export const viewport: Viewport = {
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 min-h-screen`}>
        <ThemeProvider><AuthGuard>{children}</AuthGuard></ThemeProvider>
      </body>
    </html>
  )
}
