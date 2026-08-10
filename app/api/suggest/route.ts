import { NextResponse } from 'next/server'

import { parseAcceptLanguage } from '@/lib/locale'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * YouTube's own search suggestions.
 *
 * This is the public autocomplete endpoint the youtube.com search box uses, not
 * the Data API — so it needs no key and, importantly, **costs zero quota**. The
 * 100-searches-a-day ceiling is untouched no matter how much you type.
 *
 * Proxied rather than called from the browser because the endpoint sends no
 * CORS headers, so a direct fetch is blocked.
 */
const SUGGEST_ENDPOINT = 'https://suggestqueries.google.com/complete/search'

/** Long enough to be worth asking about; below this the results are noise. */
const MIN_LENGTH = 2

const MAX_SUGGESTIONS = 10

/** Suggestions drift slowly, so let the browser reuse them for a while. */
const CACHE_HEADER = 'public, max-age=600, stale-while-revalidate=3600'

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? ''

  if (query.length < MIN_LENGTH) {
    return NextResponse.json({ suggestions: [] })
  }

  const url = new URL(SUGGEST_ENDPOINT)
  // client=firefox is what makes it answer with plain JSON instead of JSONP.
  url.searchParams.set('client', 'firefox')
  url.searchParams.set('ds', 'yt')
  url.searchParams.set('q', query)

  const language = parseAcceptLanguage(request.headers.get('accept-language'))
  if (language) url.searchParams.set('hl', language)

  try {
    const response = await fetch(url, {
      // An undecided suggestion box is worth much less than a working one.
      signal: AbortSignal.timeout(2500),
      cache: 'no-store',
    })

    if (!response.ok) return NextResponse.json({ suggestions: [] })

    /*
     * The shape is a positional array: [echoedQuery, [suggestion, ...], ...].
     * It's undocumented, so every access is guarded — a shape change should
     * quietly disable autocomplete, never break the search box.
     */
    const body: unknown = await response.json()
    const raw = Array.isArray(body) ? body[1] : null

    const suggestions = Array.isArray(raw)
      ? raw.filter((item): item is string => typeof item === 'string').slice(0, MAX_SUGGESTIONS)
      : []

    return NextResponse.json({ suggestions }, { headers: { 'Cache-Control': CACHE_HEADER } })
  } catch {
    // Timeout, network error or malformed JSON: no suggestions, no error state.
    return NextResponse.json({ suggestions: [] })
  }
}
