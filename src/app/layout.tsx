import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { JUWA2_COPY } from '@/lib/juwa2Theme'

/** Auth and Supabase-backed pages must not prerender at build (needs runtime env). */
export const dynamic = 'force-dynamic'

const juwa2Footer = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-juwa2-footer',
})

export const metadata: Metadata = {
  title: JUWA2_COPY.productName,
  description: JUWA2_COPY.productTagline,
  icons: {
    icon: [{ url: '/logo2.png', type: 'image/png' }],
    shortcut: '/logo2.png',
    apple: '/logo2.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#000000',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={juwa2Footer.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
