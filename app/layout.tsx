import type { ReactNode } from 'react'
import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { Inter } from 'next/font/google'

import { ServiceWorkerRegistrar } from '@/components/service-worker-registrar'

// Side-effect import: this is what loads Tailwind. It looks unused, so an
// "organize imports" or "remove unused imports" action will happily delete it
// and leave the whole app unstyled. Keep it.
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'MeeTube',
  description: 'Search YouTube and hide every video 3 minutes or shorter.',
  applicationName: 'MeeTube',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'MeeTube',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icon-180.png', sizes: '180x180', type: 'image/png' }],
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  themeColor: '#f97316',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  // Lets the app draw under the notch when launched from the iOS home screen.
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* Deprecated in favour of `mobile-web-app-capable`, but still what older iOS reads. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="MeeTube" />
        <link rel="apple-touch-icon" href="/icon-180.png" />
      </head>
      <body className={`${inter.variable} flex min-h-dvh flex-col font-sans antialiased`}>
        <div className="flex-1">{children}</div>

        {/*
          YouTube's API Services Terms require a privacy policy reachable without
          signing in, so this sits in the root layout rather than on one page.
        */}
        <footer className="border-t border-border/60 px-4 py-5">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <Link href="/privacy" className="underline-offset-4 hover:text-foreground hover:underline">
              Privacy Policy
            </Link>
            <span aria-hidden>&middot;</span>
            <a
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noreferrer noopener"
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              YouTube Terms of Service
            </a>
            <span aria-hidden>&middot;</span>
            <a
              href="https://github.com/Juntakk/meetube"
              target="_blank"
              rel="noreferrer noopener"
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              Source
            </a>
          </div>
        </footer>

        <ServiceWorkerRegistrar />
      </body>
    </html>
  )
}
