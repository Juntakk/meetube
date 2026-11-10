'use client'

import * as React from 'react'

import { FEED_CHANNELS } from '@/lib/channel-feed'
import { createLocalStore } from '@/lib/local-store'
import { useFollowedChannels } from '@/lib/followed-channels'
import { activeProfileName } from '@/lib/profiles'

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
  /** Added with "Add to sidebar" on the channel's page; removing it just unpins. */
  pinned?: boolean
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

/**
 * Temporary: only these channels show in the rail and the phone's avatar
 * strip, regardless of order, hidden set or follows. The feed itself is
 * untouched. Delete this (and its check in `visible`) to show everything again.
 */
const RAIL_ONLY = new Set([
  'UCqFMzb-4AUf6WAIbl132QKA', // NHL
  'UCu7ODDeIZ4x1rJwM1LCVL8w', // Thebausffs
  'UCwzCMiicL-hBUzyjWiJaseg', // Kill Tony
])

export type PinnedChannel = { id: string; title: string }

/** Channels added to the rail from their own page with "Add to sidebar". */
const pinnedStore = createLocalStore<PinnedChannel>('rail-pinned')

/**
 * Pins are also kept on the server, keyed by profile name, so they follow you
 * across devices. localStorage stays as the instant/offline copy: every change
 * is pushed up, and once per page load the server's list replaces the local one.
 */
function pushPins(pins: PinnedChannel[]) {
  const name = activeProfileName()
  if (!name) return
  fetch('/api/pins', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, pins }),
    keepalive: true,
  }).catch(() => {})
}

function updatePins(recipe: (current: PinnedChannel[]) => PinnedChannel[]) {
  pinnedStore.update(recipe)
  pushPins(pinnedStore.read())
}

let pullStarted = false
function pullPinsOnce() {
  if (pullStarted) return
  const name = activeProfileName()
  if (!name) return
  pullStarted = true

  fetch(`/api/pins?name=${encodeURIComponent(name)}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { pins: PinnedChannel[] | null } | null) => {
      if (!data) return
      if (data.pins === null) {
        // Nothing on the server yet: upload what this device already has.
        if (pinnedStore.read().length > 0) pushPins(pinnedStore.read())
      } else {
        pinnedStore.write(data.pins)
      }
    })
    .catch(() => {})
}

/** Whether a channel is pinned to the rail, and a toggle for the channel page's button. */
export function useRailPin(id: string) {
  const pinned = pinnedStore.useValue()
  const isPinned = pinned.some((channel) => channel.id === id)

  const toggle = React.useCallback(
    (channel: PinnedChannel) => {
      updatePins((current) =>
        current.some((item) => item.id === channel.id)
          ? current.filter((item) => item.id !== channel.id)
          : [...current, channel],
      )
      // A fixed channel may also be hidden from the rail; pinning should win.
      hiddenStore.update((current) => current.filter((hiddenId) => hiddenId !== channel.id))
    },
    [],
  )

  return { isPinned, toggle }
}

export function useRailChannels() {
  const hidden = hiddenStore.useValue()
  const order = orderStore.useValue()
  const pinned = pinnedStore.useValue()
  const { followed, unfollow } = useFollowedChannels()

  React.useEffect(pullPinsOnce, [])

  const byId = React.useMemo(() => {
    const map = new Map<string, RailChannel>()

    for (const channel of FEED_CHANNELS) {
      map.set(channel.id, { id: channel.id, title: channel.title, fixed: true })
    }

    for (const channel of pinned) {
      if (!map.has(channel.id)) {
        map.set(channel.id, { id: channel.id, title: channel.title, fixed: false, pinned: true })
      }
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
  }, [followed, pinned])

  const channels = React.useMemo(() => {
    const hiddenIds = new Set(hidden)
    const pinnedIds = new Set(pinned.map((channel) => channel.id))
    const visible = (id: string) =>
      (RAIL_ONLY.has(id) || pinnedIds.has(id)) && byId.has(id) && !hiddenIds.has(id)

    // Stored order first, then anything valid that isn't in it yet — a newly
    // followed channel, or a fixed one nobody has hidden — appended at the
    // end so it's never silently missing before it's been dragged anywhere.
    const ordered = order.filter(visible)
    const seen = new Set(ordered)

    const defaultOrder = [
      ...FEED_CHANNELS.map((c) => c.id),
      ...followed.map((c) => c.id),
      ...pinned.map((c) => c.id),
    ]
    for (const id of defaultOrder) {
      if (visible(id) && !seen.has(id)) {
        ordered.push(id)
        seen.add(id)
      }
    }

    return ordered.map((id) => byId.get(id)).filter((channel): channel is RailChannel => Boolean(channel))
  }, [byId, hidden, order, followed, pinned])

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
      if (channel.pinned) {
        updatePins((current) => current.filter((item) => item.id !== channel.id))
      } else if (channel.fixed) {
        updatePins((current) => current.filter((item) => item.id !== channel.id))
        hiddenStore.update((current) => (current.includes(channel.id) ? current : [...current, channel.id]))
      } else {
        unfollow(channel.id)
      }
    },
    [unfollow],
  )

  return { channels, reorder, remove }
}
