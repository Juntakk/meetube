'use client'

import type { VideoResult } from '@/lib/youtube'

/**
 * Search results, remembered for as long as the tab is open.
 *
 * Watching a video is a real navigation now rather than a dialog, so returning
 * to your results unmounts and remounts the whole view. Without this, that
 * bounce re-ran the search — 101 units, and one of only 100 searches a day,
 * spent on results you had already been looking at.
 *
 * Deliberately sessionStorage and deliberately without a TTL. Per-tab means a
 * new tab still gets fresh results; no expiry means the results you left are
 * the results you come back to, however long you were gone. Changing the query
 * or any filter is a different key, so it fetches normally — the only way to
 * force a refetch of the *same* search is a new tab.
 */

const PREFIX = 'meetube:results:'
const INDEX_KEY = 'meetube:results-index'

/**
 * A page of results is a few hundred KB, and sessionStorage is a hard ~5MB per
 * origin. Eight is well clear of that while covering any realistic back-and-forth.
 */
const MAX_ENTRIES = 8

export type CachedResults = {
  items: VideoResult[]
  nextPageToken: string | null
  filteredOut: number
}

function readIndex(): string[] {
  try {
    const raw = window.sessionStorage.getItem(INDEX_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === 'string') : []
  } catch {
    return []
  }
}

/** Moves `key` to the front and evicts anything past the cap. */
function touchIndex(key: string): void {
  const next = [key, ...readIndex().filter((existing) => existing !== key)]

  for (const stale of next.slice(MAX_ENTRIES)) {
    window.sessionStorage.removeItem(PREFIX + stale)
  }

  try {
    window.sessionStorage.setItem(INDEX_KEY, JSON.stringify(next.slice(0, MAX_ENTRIES)))
  } catch {
    // Index is only used for eviction; losing it wastes space, nothing more.
  }
}

export function readResults(key: string): CachedResults | null {
  if (typeof window === 'undefined' || !key) return null

  try {
    const raw = window.sessionStorage.getItem(PREFIX + key)
    if (!raw) return null

    const parsed = JSON.parse(raw) as CachedResults
    // A half-written or shape-changed entry must read as a miss, not a crash.
    return Array.isArray(parsed?.items) ? parsed : null
  } catch {
    return null
  }
}

export function writeResults(key: string, value: CachedResults): void {
  if (typeof window === 'undefined' || !key) return

  try {
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify(value))
    touchIndex(key)
  } catch {
    /*
     * Almost certainly the storage quota. Drop the oldest entries and let the
     * next search try again — a cache miss costs quota, a thrown error costs
     * the whole results page.
     */
    for (const stale of readIndex().slice(MAX_ENTRIES / 2)) {
      window.sessionStorage.removeItem(PREFIX + stale)
    }
  }
}
