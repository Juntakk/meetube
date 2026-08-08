/**
 * Search filter definitions, shared by the filter bar (client) and the API route
 * (server) so the accepted values can't drift apart.
 */

export const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'date', label: 'Newest' },
  { value: 'viewCount', label: 'Most viewed' },
  { value: 'rating', label: 'Top rated' },
] as const

export const UPLOADED_OPTIONS = [
  { value: 'any', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
] as const

/*
 * YouTube's videoDuration only accepts one value, and "short" means < 4 minutes —
 * which the Shorts filter already removes — so offering it would be pointless.
 * Narrowing to medium/long also means fewer results get thrown away server-side,
 * which stretches the daily quota.
 */
export const LENGTH_OPTIONS = [
  { value: 'any', label: 'Any length' },
  { value: 'medium', label: '4–20 min' },
  { value: 'long', label: '20+ min' },
] as const

export type SortValue = (typeof SORT_OPTIONS)[number]['value']
export type UploadedValue = (typeof UPLOADED_OPTIONS)[number]['value']
export type LengthValue = (typeof LENGTH_OPTIONS)[number]['value']

export type SearchFilters = {
  sort: SortValue
  uploaded: UploadedValue
  length: LengthValue
}

export const DEFAULT_FILTERS: SearchFilters = {
  sort: 'relevance',
  uploaded: 'any',
  length: 'any',
}

function isValid<T extends readonly { value: string }[]>(
  options: T,
  value: string | null | undefined,
): value is T[number]['value'] {
  return Boolean(value) && options.some((option) => option.value === value)
}

/**
 * Reads filters out of a URLSearchParams, falling back to defaults for junk input.
 * Typed structurally so Next's ReadonlyURLSearchParams works here too.
 */
export function parseFilters(params: { get(key: string): string | null }): SearchFilters {
  const sort = params.get('sort')
  const uploaded = params.get('uploaded')
  const length = params.get('length')

  return {
    sort: isValid(SORT_OPTIONS, sort) ? sort : DEFAULT_FILTERS.sort,
    uploaded: isValid(UPLOADED_OPTIONS, uploaded) ? uploaded : DEFAULT_FILTERS.uploaded,
    length: isValid(LENGTH_OPTIONS, length) ? length : DEFAULT_FILTERS.length,
  }
}

/** Only non-default values go into the URL, keeping shared links tidy. */
export function filtersToParams(filters: SearchFilters, params: URLSearchParams): void {
  for (const key of ['sort', 'uploaded', 'length'] as const) {
    if (filters[key] === DEFAULT_FILTERS[key]) {
      params.delete(key)
    } else {
      params.set(key, filters[key])
    }
  }
}

export function countActiveFilters(filters: SearchFilters): number {
  return (['sort', 'uploaded', 'length'] as const).filter(
    (key) => filters[key] !== DEFAULT_FILTERS[key],
  ).length
}

/** Turns an "uploaded" token into the RFC 3339 timestamp search.list expects. */
export function uploadedToPublishedAfter(value: UploadedValue, now = Date.now()): string | null {
  const days: Record<Exclude<UploadedValue, 'any'>, number> = {
    today: 1,
    week: 7,
    month: 30,
    year: 365,
  }

  if (value === 'any') return null

  return new Date(now - days[value] * 86400 * 1000).toISOString()
}
