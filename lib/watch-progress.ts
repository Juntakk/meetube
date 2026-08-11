'use client'

import * as React from 'react'

import { createLocalStore } from '@/lib/local-store'
import type { VideoResult } from '@/lib/youtube'

/**
 * How far you got through each video, so opening one again picks up where you
 * stopped instead of restarting it.
 *
 * Deliberately separate from lib/watch-history.ts, which is the *ranking* signal:
 * that one stays lightweight (no snapshots) and remembers 120 videos, because a
 * taste profile wants a long memory and only needs ids and titles. This one
 * carries a full VideoResult so History and the Continue-watching shelf render
 * with no API calls at all, which costs ~1KB an entry — so it remembers far
 * fewer. Two stores, two jobs, two very different size budgets.
 *
 * Never leaves the device. See app/privacy/page.tsx.
 */

/** Snapshots are the expensive part, so this list stays short. */
const MAX_ENTRIES = 40

/** Below this a "watch" is a mis-tap, and there's nothing worth resuming. */
export const MIN_RESUME_SECONDS = 15

/** Under this we don't even record: it's noise, and it would evict real entries. */
const MIN_RECORD_SECONDS = 5

/** Within this fraction of the end, count it as finished rather than resumable. */
export const DONE_FRACTION = 0.92

/**
 * Resume slightly *before* where you stopped. Dropping in mid-sentence is
 * disorienting; a few seconds of run-up is how every video app does it.
 */
const REWIND_SECONDS = 3

export type ProgressEntry = {
  video: VideoResult
  /** Where playback got to, in whole seconds. */
  seconds: number
  /**
   * Length as the *player* reported it. Kept rather than relying on
   * `video.durationSeconds`, which comes from the API and can disagree by a
   * second or two — enough to leave a video permanently at 99% and never done.
   */
  duration: number
  /** Epoch ms of the last update; the list is ordered by it, newest first. */
  at: number
}

const store = createLocalStore<ProgressEntry>('meetube:watch-progress')

/** True once you're close enough to the end that there's nothing to go back to. */
export function isFinished(entry: ProgressEntry): boolean {
  const total = entry.duration > 0 ? entry.duration : entry.video.durationSeconds
  if (total <= 0) return false

  return entry.seconds / total >= DONE_FRACTION
}

/** 0–1, or null when this video has no recorded position. */
export function progressFraction(entry: ProgressEntry | undefined): number | null {
  if (!entry) return null

  const total = entry.duration > 0 ? entry.duration : entry.video.durationSeconds
  if (total <= 0) return null

  return Math.min(1, Math.max(0, entry.seconds / total))
}

/**
 * Where to start playback for a video, in seconds. 0 means from the beginning.
 *
 * A plain read rather than a hook, because the player needs this at the moment it
 * is constructed. Through `useSyncExternalStore` the first client render returns
 * the server's empty snapshot, so a hook would hand the player 0 and only produce
 * the real figure a render later — by which time the player exists and its
 * `start` has already been baked in.
 */
export function readResumeSeconds(id: string): number {
  const entry = store.read().find((item) => item.video.id === id)

  if (!entry) return 0
  if (entry.seconds < MIN_RESUME_SECONDS) return 0
  // Finished: start over, which is what tapping a watched video should do.
  if (isFinished(entry)) return 0

  return Math.max(0, Math.floor(entry.seconds - REWIND_SECONDS))
}

/** Called by the player as it plays, and once more when it stops. */
export function recordProgress(video: VideoResult, seconds: number, duration: number) {
  if (!Number.isFinite(seconds) || seconds < MIN_RECORD_SECONDS) return

  const total = Number.isFinite(duration) && duration > 0 ? duration : video.durationSeconds

  store.update((current) =>
    [
      { video, seconds: Math.floor(seconds), duration: Math.floor(total), at: Date.now() },
      // Re-watching moves the entry to the front rather than duplicating it.
      ...current.filter((item) => item.video.id !== video.id),
    ].slice(0, MAX_ENTRIES),
  )
}

export function useWatchProgress() {
  const entries = store.useValue()

  /** Keyed for the O(1) lookup every card in a 24-item grid does. */
  const byId = React.useMemo(
    () => new Map(entries.map((entry) => [entry.video.id, entry])),
    [entries],
  )

  /** Started, not finished — what the Continue-watching shelf shows. */
  const resumable = React.useMemo(
    () => entries.filter((entry) => entry.seconds >= MIN_RESUME_SECONDS && !isFinished(entry)),
    [entries],
  )

  const remove = React.useCallback((id: string) => {
    store.update((current) => current.filter((item) => item.video.id !== id))
  }, [])

  const clear = React.useCallback(() => store.write([]), [])

  return { entries, byId, resumable, remove, clear }
}
