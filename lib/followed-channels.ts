'use client'

import * as React from 'react'

import { createLocalStore } from '@/lib/local-store'

/**
 * Channels you've asked to see more of.
 *
 * A local stand-in for subscribing, which MeeTube can't do: its YouTube access is
 * read-only by design. Nothing is sent to Google — this list only decides what the
 * home feed asks for.
 *
 * It's also by far the cheapest way to fill a feed. A followed channel costs 2
 * quota units to read (its uploads playlist, then one videos.list), where a topic
 * search costs 101 and burns one of the day's 100 searches. Follow a handful of
 * channels and the feed largely stops needing to search at all.
 */

/** Well past what anyone will follow by hand, and 50 ids is a trivial payload. */
const MAX_FOLLOWED = 50

export type FollowedChannel = {
  /** The UC… channel id. */
  id: string
  title: string
  /** Only known when followed from a channel page; feed cards have no avatar. */
  avatar?: string
}

const store = createLocalStore<FollowedChannel>('meetube:followed-channels')

export function useFollowedChannels() {
  const followed = store.useValue()

  const followedIds = React.useMemo(
    () => new Set(followed.map((channel) => channel.id)),
    [followed],
  )

  const toggle = React.useCallback((channel: FollowedChannel) => {
    if (!channel.id) return

    store.update((current) =>
      current.some((item) => item.id === channel.id)
        ? current.filter((item) => item.id !== channel.id)
        : // Newest first, so a fresh follow is the first to be seeded.
          [channel, ...current].slice(0, MAX_FOLLOWED),
    )
  }, [])

  const unfollow = React.useCallback((id: string) => {
    store.update((current) => current.filter((item) => item.id !== id))
  }, [])

  return { followed, followedIds, toggle, unfollow }
}
