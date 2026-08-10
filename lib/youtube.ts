/**
 * Shared YouTube types + duration helpers.
 *
 * This module is imported by both the API route (server) and the UI (client),
 * so it must stay free of any secrets or Node-only APIs.
 */

/**
 * Anything at or below this length is treated as a Short and dropped.
 *
 * 180s, not 60s: YouTube raised the Shorts ceiling to 3 minutes in Oct 2024, so
 * a 60s cutoff would let plenty of Shorts through. The tradeoff is that genuinely
 * short long-form videos (trailers, music videos, news clips) get hidden too —
 * lower this to 60 if you'd rather see those and tolerate some Shorts.
 */
export const SHORTS_MAX_SECONDS = 180

export type VideoResult = {
  id: string
  title: string
  channelTitle: string
  channelId: string
  publishedAt: string
  description: string
  thumbnail: string
  durationSeconds: number
  /** Pre-formatted "4:13" / "1:02:44" label. */
  duration: string
  /** null when YouTube omits the counter (rare for views, common for hidden likes). */
  viewCount: number | null
  likeCount: number | null
}

export type ChannelInfo = {
  id: string
  title: string
  description: string
  avatar: string
  /** Empty string when the channel has no banner, which is common. */
  banner: string
  /** null when the owner hides the count. */
  subscriberCount: number | null
  videoCount: number | null
  /** The "@handle" form, without which a channel page looks unfinished. */
  handle: string
}

export type QuotaInfo = {
  units: { used: number; limit: number; remaining: number }
  searches: { used: number; limit: number; remaining: number }
  searchesLeft: number
  resetsIn: number
  day: string
  budget: number
  exhausted: boolean
  budgetReached: boolean
  /** False when the ledger started mid-day and may have missed earlier spend. */
  trustworthy: boolean
  backend: 'redis' | 'file' | 'memory'
}

export type SearchResponse = {
  items: VideoResult[]
  nextPageToken: string | null
  /** How many Shorts were removed from this page — useful for the "keep loading" hint. */
  filteredOut: number
  /** Attached to every response so the meter updates without a second request. */
  quota?: QuotaInfo
}

export type SearchErrorResponse = {
  error: string
}

const ISO_8601_DURATION =
  /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/

/**
 * Parses an ISO 8601 duration as returned by videos.list contentDetails.duration
 * (e.g. "PT4M13S", "PT1H2M44S", "P1DT2H", "PT45S").
 *
 * Returns 0 for anything unparseable. Live streams report "P0D", which parses to
 * 0 and would therefore look like a Short — the API route filters those by
 * liveBroadcastContent instead, before length is considered.
 */
export function parseISO8601Duration(value: string | undefined | null): number {
  if (!value) return 0

  const match = ISO_8601_DURATION.exec(value)
  if (!match) return 0

  const [, days, hours, minutes, seconds] = match

  return (
    Number(days ?? 0) * 86400 +
    Number(hours ?? 0) * 3600 +
    Number(minutes ?? 0) * 60 +
    Math.floor(Number(seconds ?? 0))
  )
}

/** 253 -> "4:13", 3764 -> "1:02:44" */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '0:00'

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)

  const paddedSeconds = String(seconds).padStart(2, '0')

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`
  }

  return `${minutes}:${paddedSeconds}`
}

export function isShort(durationSeconds: number): boolean {
  return durationSeconds <= SHORTS_MAX_SECONDS
}

/** "3 days ago", "2 months ago" — matches the YouTube-ish feel without a date lib. */
export function formatRelativeDate(isoDate: string): string {
  const then = new Date(isoDate).getTime()
  if (Number.isNaN(then)) return ''

  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000))

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]

  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

  for (const [unit, unitSeconds] of units) {
    if (seconds >= unitSeconds) {
      return formatter.format(-Math.floor(seconds / unitSeconds), unit)
    }
  }

  return 'just now'
}

/** 1234 -> "1.2K", 4500000 -> "4.5M" */
export function formatCompactNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return ''

  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

/** Statistics arrive as strings, and are absent entirely when the owner hides them. */
export function parseCount(value: string | undefined): number | null {
  if (value === undefined) return null

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** Decodes the HTML entities YouTube returns in snippet.title (&amp;, &#39;, ...). */
export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
}
