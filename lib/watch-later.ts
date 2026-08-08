'use client'

import * as React from 'react'

import { createLocalStore } from '@/lib/local-store'
import type { VideoResult } from '@/lib/youtube'

const MAX_SAVED = 300

/*
 * Full VideoResult objects are stored, not just IDs, so the saved list renders
 * with zero API calls — it costs no quota and works offline.
 */
const store = createLocalStore<VideoResult>('meetube:watch-later', 'metube:watch-later')

export function useWatchLater() {
  const saved = store.useValue()

  const toggle = React.useCallback((video: VideoResult) => {
    store.update((current) =>
      current.some((item) => item.id === video.id)
        ? current.filter((item) => item.id !== video.id)
        : // Newest first, and bounded so localStorage can't grow without limit.
          [video, ...current].slice(0, MAX_SAVED),
    )
  }, [])

  const remove = React.useCallback((id: string) => {
    store.update((current) => current.filter((item) => item.id !== id))
  }, [])

  const clear = React.useCallback(() => store.write([]), [])

  const savedIds = React.useMemo(() => new Set(saved.map((item) => item.id)), [saved])

  return { saved, savedIds, toggle, remove, clear }
}
