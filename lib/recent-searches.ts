'use client'

import * as React from 'react'

import { createLocalStore } from '@/lib/local-store'

const MAX_RECENT = 10

const store = createLocalStore<string>('meetube:recent-searches', 'metube:recent-searches')

export function useRecentSearches() {
  const recent = store.useValue()

  const add = React.useCallback((query: string) => {
    const trimmed = query.trim()
    if (!trimmed) return

    store.update((current) => {
      // Case-insensitive dedupe, most recent first.
      const withoutDupe = current.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())
      return [trimmed, ...withoutDupe].slice(0, MAX_RECENT)
    })
  }, [])

  const remove = React.useCallback((query: string) => {
    store.update((current) => current.filter((item) => item !== query))
  }, [])

  const clear = React.useCallback(() => store.write([]), [])

  return { recent, add, remove, clear }
}
