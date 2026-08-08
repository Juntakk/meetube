'use client'

import * as React from 'react'

/**
 * A tiny localStorage-backed list store with React subscriptions.
 *
 * Everything the app remembers (saved videos, watch history, recent searches)
 * is a bounded list on this device, so they all share this. Reads go through
 * useSyncExternalStore, which keeps SSR from touching `window` and keeps every
 * subscriber in step when one of them writes.
 */
export function createLocalStore<T>(storageKey: string, legacyKey?: string) {
  let cache: T[] | null = null
  const listeners = new Set<() => void>()

  const EMPTY: T[] = []

  function read(): T[] {
    if (cache) return cache

    if (typeof window === 'undefined') {
      cache = EMPTY
      return cache
    }

    try {
      let raw = window.localStorage.getItem(storageKey)

      // One-time migration from an earlier key, so a rename doesn't silently
      // throw away someone's saved videos or history.
      if (raw === null && legacyKey) {
        const legacy = window.localStorage.getItem(legacyKey)
        if (legacy !== null) {
          window.localStorage.setItem(storageKey, legacy)
          window.localStorage.removeItem(legacyKey)
          raw = legacy
        }
      }

      const parsed = raw ? JSON.parse(raw) : []
      cache = Array.isArray(parsed) ? (parsed as T[]) : []
    } catch {
      // Corrupt JSON, or storage blocked in private mode — start clean.
      cache = []
    }

    return cache
  }

  function write(next: T[]) {
    cache = next

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // Out of quota or storage unavailable; the in-memory copy still works.
    }

    listeners.forEach((listener) => listener())
  }

  function update(recipe: (current: T[]) => T[]) {
    write(recipe(read()))
  }

  function subscribe(listener: () => void) {
    listeners.add(listener)

    // Keep other tabs (or a tab plus the installed PWA) in sync.
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        cache = null
        listener()
      }
    }

    window.addEventListener('storage', onStorage)

    return () => {
      listeners.delete(listener)
      window.removeEventListener('storage', onStorage)
    }
  }

  function useValue(): T[] {
    // getServerSnapshot returns a stable empty array; React re-renders with the
    // real contents immediately after hydration.
    return React.useSyncExternalStore(subscribe, read, () => EMPTY)
  }

  return { read, write, update, useValue }
}
