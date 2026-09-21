'use client'

import * as React from 'react'

import { activeProfileId } from '@/lib/profiles'

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
  /**
   * Play the next video in the watch sidebar when one ends. On by default,
   * matching YouTube — and unlike `autoLoad` it costs nothing extra, since the
   * sidebar has already been fetched by the time it can fire.
   */
  autoplayNext: boolean
  /**
   * Hold a screen wake lock on the watch page. Off by default: it costs battery
   * for as long as a video is open, which is a cost the user should choose. See
   * lib/wake-lock.ts for why this exists instead of background playback.
   */
  keepScreenOn: boolean
  /**
   * Player volume, 0–100, and whether it's muted — remembered across videos and
   * sessions the way youtube.com remembers them. Kept separate from `muted` so
   * that unmuting restores the level you had rather than jumping to full.
   */
  volume: number
  muted: boolean
  /**
   * How the home feed orders the channels' uploads.
   *
   * `shuffled` is the default — it's the whole point of the fixed channel list
   * over a chronological wall of whichever channel posts most. `newest` is
   * still offered for when you want a literal feed of what just went up.
   */
  feedSort: 'shuffled' | 'newest'
  /**
   * Language code of the subtitle track to switch on, or null for off.
   *
   * Remembered rather than reset per video, so someone who watches with subtitles
   * gets subtitles. Falls back to the video's own best match when it doesn't carry
   * this language — see `preferredTrack` in player-controls.
   */
  captionLanguage: string | null
  /**
   * Desktop-only "theater mode": the watch page drops its sidebar column so
   * the player takes the full width. Doesn't apply on a phone, which is
   * already single-column and full-width without it — see the `md:` guards
   * everywhere this is read.
   */
  theaterMode: boolean
}

/** Namespaced per profile, computed at read/write time — see lib/local-store.ts. */
function storageKey(): string {
  return `meetube:${activeProfileId() ?? '_none'}:prefs`
}

const DEFAULTS: Prefs = {
  autoLoad: false,
  autoplayNext: true,
  keepScreenOn: false,
  volume: 100,
  muted: false,
  feedSort: 'shuffled',
  captionLanguage: null,
  theaterMode: false,
}

let cache: Prefs | null = null
const listeners = new Set<() => void>()

function read(): Prefs {
  if (cache) return cache

  if (typeof window === 'undefined') {
    cache = DEFAULTS
    return cache
  }

  try {
    const raw = window.localStorage.getItem(storageKey())
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
      window.localStorage.setItem(storageKey(), JSON.stringify(cache))
    } catch {
      // Storage blocked; the in-memory value still applies this session.
    }

    listeners.forEach((listener) => listener())
  }, [])

  return { prefs, set }
}
