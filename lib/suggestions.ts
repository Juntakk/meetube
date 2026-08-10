'use client'

import * as React from 'react'

import { useRecentSearches } from '@/lib/recent-searches'

/**
 * YouTube search suggestions for what's currently typed.
 *
 * Debounced at 150ms — fast enough to feel live, slow enough that a typed word
 * is one request rather than one per keystroke. The endpoint behind this costs
 * no API quota (see app/api/suggest/route.ts), so the debounce is about
 * politeness and bandwidth, not budget.
 */
const DEBOUNCE_MS = 150

/** How many matching recents to promote above YouTube's own suggestions. */
const MAX_RECENT_WHILE_TYPING = 3

export function useSuggestions(query: string): string[] {
  const [suggestions, setSuggestions] = React.useState<string[]>([])

  React.useEffect(() => {
    const trimmed = query.trim()

    if (trimmed.length < 2) {
      setSuggestions([])
      return
    }

    const controller = new AbortController()

    const timer = setTimeout(() => {
      fetch(`/api/suggest?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((response) => response.json() as Promise<{ suggestions?: string[] }>)
        .then((data) => setSuggestions(data.suggestions ?? []))
        .catch(() => {
          // Aborted by the next keystroke, or offline. Either way the previous
          // list stays on screen, which reads better than it blanking.
        })
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  return suggestions
}

export type Suggestion = {
  value: string
  /** Recent searches are removable and get the clock icon; the rest don't. */
  source: 'recent' | 'youtube'
}

/**
 * The dropdown's contents, shared by the desktop search box and the phone's
 * full-screen search page so the two suggest identically.
 *
 * Empty box: recent searches only, which is what the box is for before you've
 * said anything. Typing: YouTube's suggestions, with any matching recents
 * promoted above them because a search you've actually run beats a guess.
 */
export function useSearchHints(input: string, active: boolean) {
  const { recent, add, remove, clear } = useRecentSearches()
  const remote = useSuggestions(active ? input : '')

  const typed = input.trim()

  const items = React.useMemo<Suggestion[]>(() => {
    if (typed === '') {
      return recent.map((value) => ({ value, source: 'recent' as const }))
    }

    const lower = typed.toLowerCase()
    const matchingRecent = recent
      .filter((value) => value.toLowerCase().includes(lower) && value.toLowerCase() !== lower)
      .slice(0, MAX_RECENT_WHILE_TYPING)

    const seen = new Set(matchingRecent.map((value) => value.toLowerCase()))

    return [
      ...matchingRecent.map((value) => ({ value, source: 'recent' as const })),
      ...remote
        .filter((value) => !seen.has(value.toLowerCase()))
        .map((value) => ({ value, source: 'youtube' as const })),
    ]
  }, [recent, remote, typed])

  return { items, typed, addRecent: add, removeRecent: remove, clearRecent: clear }
}
