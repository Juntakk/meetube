import { Suspense } from 'react'

import { SearchView } from '@/components/search-view'

export default function HomePage() {
  return (
    <main className="min-h-dvh">
      {/* useSearchParams needs a Suspense boundary during prerender. */}
      <Suspense>
        <SearchView />
      </Suspense>
    </main>
  )
}
