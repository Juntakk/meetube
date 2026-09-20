'use client'

import * as React from 'react'

import { activeProfileId } from '@/lib/profiles'

/**
 * A tiny localStorage-backed list store with React subscriptions.
 *
 * Everything the app remembers (saved videos, watch history, recent searches)
 * is a bounded list on this device, so they all share this. Reads go through
 * useSyncExternalStore, which keeps SSR from touching `window` and keeps every
 * subscriber in step when one of them writes.
 *
 * Each store is per-profile: `suffix` is a bare name like `'watch-later'`, and
 * the actual key is namespaced with whichever profile this document froze on
 * at start-up (see lib/profiles.ts). It's computed here, at read/write time,
 * rather than once when this factory runs — the factory runs at module scope,
 * before any profile is known.
 */
export function createLocalStore<T>(suffix: string) {
  let cache: T[] | null = null
  let cachedKey: string | null = null
  const listeners = new Set<() => void>()

  const EMPTY: T[] = []

  function storageKey(): string {
    return `meetube:${activeProfileId() ?? '_none'}:${suffix}`
  }

  function read(): T[] {
    if (cache) return cache

    if (typeof window === 'undefined') {
      cache = EMPTY
      return cache
    }

    try {
      cachedKey = storageKey()
      const raw = window.localStorage.getItem(cachedKey)
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
      cachedKey = storageKey()
      window.localStorage.setItem(cachedKey, JSON.stringify(next))
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

    // Keep other tabs (or a tab plus the installed PWA) in sync — only ever
    // relevant when they share a profile, since a switch elsewhere is a full
    // reload, not a live key change, on both ends.
    const onStorage = (event: StorageEvent) => {
      if (event.key === (cachedKey ?? storageKey())) {
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
