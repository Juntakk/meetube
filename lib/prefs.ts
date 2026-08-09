'use client'

import * as React from 'react'

/**
 * Client-side behaviour preferences.
 *
 * `autoLoad` defaults to **off**, and that default is the single biggest quota
 * saving available. Infinite scroll fires 400px before the sentinel is visible,
 * so idle scrolling silently spends 101 units a page. With it off, another page
 * is only ever fetched when you press "Load more".
 */
export type Prefs = {
  autoLoad: boolean
}

const STORAGE_KEY = 'meetube:prefs'
const DEFAULTS: Prefs = { autoLoad: false }

let cache: Prefs | null = null
const listeners = new Set<() => void>()

function read(): Prefs {
  if (cache) return cache

  if (typeof window === 'undefined') {
    cache = DEFAULTS
    return cache
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    cache = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULTS
  } catch {
    cache = DEFAULTS
  }

  return cache
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function usePrefs() {
  const prefs = React.useSyncExternalStore(subscribe, read, () => DEFAULTS)

  const set = React.useCallback((patch: Partial<Prefs>) => {
    cache = { ...read(), ...patch }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
    } catch {
      // Storage blocked; the in-memory value still applies this session.
    }

    listeners.forEach((listener) => listener())
  }, [])

  return { prefs, set }
}
