'use client'

import * as React from 'react'

import { createLocalStore } from '@/lib/local-store'
import { DEFAULT_INTEREST_IDS, getInterests, INTERESTS } from '@/lib/interests'

const store = createLocalStore<string>('meetube:interests')

/**
 * Which topics the feed is allowed to draw from.
 *
 * An empty stored list is ambiguous — "never chosen" and "turned everything off"
 * look identical in localStorage — so a sentinel marks the deliberate case and
 * a genuinely empty store falls back to every topic on.
 */
const NONE = '__none__'

export function useInterests() {
  const stored = store.useValue()

  const enabledIds = React.useMemo(() => {
    if (stored.length === 0) return DEFAULT_INTEREST_IDS
    if (stored.length === 1 && stored[0] === NONE) return []
    return stored.filter((id) => id !== NONE)
  }, [stored])

  const interests = React.useMemo(() => getInterests(enabledIds), [enabledIds])

  const toggle = React.useCallback(
    (id: string) => {
      const next = enabledIds.includes(id)
        ? enabledIds.filter((existing) => existing !== id)
        : [...enabledIds, id]

      store.write(next.length === 0 ? [NONE] : next)
    },
    [enabledIds],
  )

  const reset = React.useCallback(() => store.write([]), [])

  const allOn = enabledIds.length === INTERESTS.length

  return { interests, enabledIds, toggle, reset, allOn }
}
