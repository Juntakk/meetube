/**
 * Where a search is being run from, derived from request headers.
 *
 * youtube.com localises search heavily — the same words return different videos
 * in Montreal than in Mumbai, and that localisation is a large part of why its
 * results feel precise. `search.list` exposes the same two knobs, and without
 * them every query is answered as if it came from nowhere in particular.
 *
 * Both are hints, not filters: `relevanceLanguage` boosts results in that
 * language rather than excluding others, so a French-locale user still gets the
 * English video that is genuinely the best match.
 */

/** ISO 3166-1 alpha-2, which is what regionCode expects. */
const COUNTRY = /^[A-Z]{2}$/

/** ISO 639-1, optionally with a script or region suffix ("pt-BR" is accepted). */
const LANGUAGE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/

export type SearchLocale = {
  regionCode?: string
  relevanceLanguage?: string
}

/**
 * Picks the highest-weighted language out of an Accept-Language header.
 *
 * Browsers already send these sorted by descending q-value, but the header is
 * user-controllable and the spec doesn't require the order, so the q-values are
 * parsed rather than trusted. "*" is skipped: it means "anything", which is
 * exactly the no-hint case.
 */
export function parseAcceptLanguage(header: string | null | undefined): string | undefined {
  if (!header) return undefined

  let best: { tag: string; quality: number } | undefined

  for (const part of header.split(',')) {
    const [rawTag, ...params] = part.trim().split(';')
    const tag = rawTag.trim()

    if (!tag || tag === '*' || !LANGUAGE.test(tag)) continue

    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
    const parsed = qParam ? Number(qParam.slice(2)) : 1
    const quality = Number.isFinite(parsed) ? parsed : 0

    if (quality > 0 && (!best || quality > best.quality)) best = { tag, quality }
  }

  // The API wants a bare ISO 639-1 code, so "en-CA" has to become "en".
  return best?.tag.split('-')[0].toLowerCase()
}

/**
 * `x-vercel-ip-country` is set by Vercel's edge on every request and is absent
 * locally, which is the right behaviour: no header means no region hint, not a
 * guess at one.
 */
export function readSearchLocale(headers: Headers): SearchLocale {
  const country = headers.get('x-vercel-ip-country')?.trim().toUpperCase()

  return {
    regionCode: country && COUNTRY.test(country) ? country : undefined,
    relevanceLanguage: parseAcceptLanguage(headers.get('accept-language')),
  }
}
