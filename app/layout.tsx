import { Suspense, type ReactNode } from 'react'
import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { Roboto } from 'next/font/google'

import { BottomDock } from '@/components/bottom-dock'
import { SearchOverlay } from '@/components/search-overlay'
import { AuthProvider } from '@/components/session-provider'
import { ServiceWorkerRegistrar } from '@/components/service-worker-registrar'

// Side-effect import: this is what loads Tailwind. It looks unused, so an
// "organize imports" or "remove unused imports" action will happily delete it
// and leave the whole app unstyled. Keep it.
import './globals.css'

// YouTube's own typeface. 500 is the weight every title and label uses.
const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-sans',
  display: 'swap',
})

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
  // Matches the app-bar background, so the status bar blends into the chrome
  // instead of showing a coloured band above it.
  themeColor: '#0f0f0f',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  // Deliberately not maximum-scale: pinch-zoom stays available.
  viewportFit: 'cover',
  // Keeps the layout above the on-screen keyboard rather than behind it.
  interactiveWidget: 'resizes-content',
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
      <body className={`${roboto.variable} flex min-h-dvh flex-col font-sans antialiased`}>
        <AuthProvider>
          {/* Padding, not margin: the dock is fixed, so content has to end above it. */}
          <div className="flex-1 pb-dock-safe md:pb-0">{children}</div>

          {/*
            YouTube's API Services Terms require a privacy policy reachable
            without signing in. On a phone the dock covers the bottom of the
            page, so these links live in its account sheet instead — the same
            place youtube.com keeps them.
          */}
          <footer className="hidden border-t border-border/60 px-4 py-5 md:block">
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

          {/* Both read the URL's search params, so both need a boundary. */}
          <Suspense>
            <BottomDock />
            <SearchOverlay />
          </Suspense>

          <ServiceWorkerRegistrar />
        </AuthProvider>
      </body>
    </html>
  )
}
