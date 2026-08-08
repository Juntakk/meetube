'use client'

import * as React from 'react'

import { createLocalStore } from '@/lib/local-store'
import type { VideoResult } from '@/lib/youtube'

const MAX_HISTORY = 120

/**
 * Which videos you actually opened. This is the strongest taste signal the app
 * has — stronger than a search, which is only intent to look.
 *
 * Deliberately lightweight: no thumbnails or descriptions, just what the ranker
 * needs. Never leaves the device; the API route only ever receives seed terms.
 */
export type WatchEntry = {
  id: string
  title: string
  channelId: string
  channelTitle: string
  /** Epoch ms, used for recency decay. */
  at: number
}

const store = createLocalStore<WatchEntry>('meetube:watch-history', 'metube:watch-history')

/** Called when a video is opened in the player. */
export function recordWatch(video: VideoResult) {
  store.update((current) => [
    {
      id: video.id,
      title: video.title,
      channelId: video.channelId,
      channelTitle: video.channelTitle,
      at: Date.now(),
    },
    // Re-watching moves an entry to the front rather than duplicating it.
    ...current.filter((entry) => entry.id !== video.id),
  ].slice(0, MAX_HISTORY))
}

export function useWatchHistory() {
  const history = store.useValue()

  const clear = React.useCallback(() => store.write([]), [])

  return { history, clear }
}
