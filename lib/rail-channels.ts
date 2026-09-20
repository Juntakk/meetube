'use client'

import * as React from 'react'

import { FEED_CHANNELS } from '@/lib/channel-feed'
import { createLocalStore } from '@/lib/local-store'
import { useFollowedChannels } from '@/lib/followed-channels'

/**
 * The side rail's own order and hidden set — separate from what actually
 * feeds the home feed.
 *
 * `FEED_CHANNELS` (lib/channel-feed.ts) and your followed list
 * (lib/followed-channels.ts) both keep feeding the feed exactly as before;
 * this only changes how their union is *displayed* in the rail. Hiding one
 * of the 16 fixed channels here doesn't stop its uploads from showing up on
 * the home page — it only removes the shortcut. A followed channel has no
 * separate "hide": removing it here unfollows it outright, same as it
 * already did before this existed.
 */

export type RailChannel = {
  id: string
  title: string
  /** Whether this is one of the code-defined FEED_CHANNELS, vs. followed. */
  fixed: boolean
}

/** Fixed-channel ids hidden from this profile's rail. */
const hiddenStore = createLocalStore<string>('rail-hidden')

/**
 * This profile's full custom order across both fixed and followed channels,
 * as a flat array of ids. Empty means "use the default order" — fixed list,
 * then followed, in their existing orders — which is what the rail already
 * showed before this existed, so nothing visually changes until someone
 * actually drags something.
 */
const orderStore = createLocalStore<string>('rail-order')

export function useRailChannels() {
  const hidden = hiddenStore.useValue()
  const order = orderStore.useValue()
  const { followed, unfollow } = useFollowedChannels()

  const byId = React.useMemo(() => {
    const map = new Map<string, RailChannel>()

    for (const channel of FEED_CHANNELS) {
      map.set(channel.id, { id: channel.id, title: channel.title, fixed: true })
    }

    // Followed can include a FEED_CHANNELS id too (following one you already
    // see by default); the fixed entry wins so `fixed` stays accurate for the
    // hide/unfollow split below.
    for (const channel of followed) {
      if (!map.has(channel.id)) {
        map.set(channel.id, { id: channel.id, title: channel.title, fixed: false })
      }
    }

    return map
  }, [followed])

  const channels = React.useMemo(() => {
    const hiddenIds = new Set(hidden)
    const visible = (id: string) => byId.has(id) && !hiddenIds.has(id)

    // Stored order first, then anything valid that isn't in it yet — a newly
    // followed channel, or a fixed one nobody has hidden — appended at the
    // end so it's never silently missing before it's been dragged anywhere.
    const ordered = order.filter(visible)
    const seen = new Set(ordered)

    const defaultOrder = [...FEED_CHANNELS.map((c) => c.id), ...followed.map((c) => c.id)]
    for (const id of defaultOrder) {
      if (visible(id) && !seen.has(id)) {
        ordered.push(id)
        seen.add(id)
      }
    }

    return ordered.map((id) => byId.get(id)).filter((channel): channel is RailChannel => Boolean(channel))
  }, [byId, hidden, order, followed])

  const reorder = React.useCallback(
    (activeId: string, overId: string) => {
      if (activeId === overId) return

      const current = channels.map((channel) => channel.id)
      const from = current.indexOf(activeId)
      const to = current.indexOf(overId)
      if (from === -1 || to === -1) return

      const next = [...current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      orderStore.write(next)
    },
    [channels],
  )

  const remove = React.useCallback(
    (channel: RailChannel) => {
      if (channel.fixed) {
        hiddenStore.update((current) => (current.includes(channel.id) ? current : [...current, channel.id]))
      } else {
        unfollow(channel.id)
      }
    },
    [unfollow],
  )

  return { channels, reorder, remove }
}
