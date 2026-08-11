import type { Metadata } from 'next'

import { HistoryView } from '@/components/history-view'
import { SiteHeader } from '@/components/site-header'
import { isAuthConfigured } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'History — MeeTube',
}

/**
 * Mirrors youtube.com/feed/history as a real route, so it's linkable and the back
 * button behaves.
 *
 * Static, and deliberately so: history lives in localStorage, so there is nothing
 * for the server to fetch and no API quota involved in opening this page.
 */
export default function HistoryPage() {
  return (
    <main className="min-h-dvh">
      <SiteHeader authConfigured={isAuthConfigured()} />
      <HistoryView />
    </main>
  )
}
