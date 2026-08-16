'use client'

import * as React from 'react'

import { createLocalStore } from '@/lib/local-store'
import type { VideoResult } from '@/lib/youtube'

/**
 * The play queue: videos lined up to play after this one, in order.
 *
 * Persisted rather than session-only, which is where this differs from
 * youtube.com. Everything else this app remembers survives a reload, and a queue
 * you built up being silently emptied by a refresh would be the odd one out.
 *
 * A queued video leaves the queue when you arrive at it — see the dequeue effect
 * in watch-view — so the list always reads as "what's still coming".
 */

/** Long enough for any realistic session, short enough to stay a small write. */
const MAX_QUEUED = 50

const store = createLocalStore<VideoResult>('meetube:queue')

/**
 * The next video to play, without subscribing.
 *
 * A plain read because the player's ended handler needs an answer at the moment
 * the video finishes, and a hook's value would be whatever it was when the
 * handler was last rebuilt.
 */
export function peekQueue(): VideoResult | null {
  return store.read()[0] ?? null
}

/** Called on arrival: what is playing is no longer waiting to play. */
export function dequeue(id: string) {
  const current = store.read()
  if (!current.some((item) => item.id === id)) return

  store.write(current.filter((item) => item.id !== id))
}

/**
 * To the back of the queue. Re-adding something already queued is a no-op rather
 * than a move: you asked for it to play, and it already will.
 */
export function enqueue(video: VideoResult) {
  store.update((current) =>
    current.some((item) => item.id === video.id)
      ? current
      : [...current, video].slice(0, MAX_QUEUED),
  )
}

/**
 * To the front, so it plays as soon as the current video finishes. Unlike
 * enqueue this *does* move an already-queued video, because "play next" is a
 * statement about position rather than membership.
 */
export function enqueueNext(video: VideoResult) {
  store.update((current) =>
    [video, ...current.filter((item) => item.id !== video.id)].slice(0, MAX_QUEUED),
  )
}

export function removeFromQueue(id: string) {
  store.update((current) => current.filter((item) => item.id !== id))
}

export function clearQueue() {
  store.write([])
}

/*
 * The operations live at module scope and the hook only supplies the subscription.
 * That keeps them callable from an event handler that has no component around it
 * — and testable without a React renderer.
 */
export function useQueue() {
  const queue = store.useValue()

  const queuedIds = React.useMemo(() => new Set(queue.map((item) => item.id)), [queue])

  return {
    queue,
    queuedIds,
    add: enqueue,
    playNext: enqueueNext,
    remove: removeFromQueue,
    clear: clearQueue,
  }
}
