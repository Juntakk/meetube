import { Suspense } from 'react'

import { SearchView } from '@/components/search-view'
import { isAuthConfigured } from '@/lib/auth'

export default function HomePage() {
  return (
    <main className="min-h-dvh">
      {/* useSearchParams needs a Suspense boundary during prerender. */}
      <Suspense>
        {/* Read on the server so the sign-in button is hidden when OAuth isn't set up. */}
        <SearchView authConfigured={isAuthConfigured()} />
      </Suspense>
    </main>
  )
}
