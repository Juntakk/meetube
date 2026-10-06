'use client'

import Link from 'next/link'

import { Avatar } from '@/components/avatar'
import { useRailChannels } from '@/lib/rail-channels'

/**
 * The phone's way into a channel: a swipeable row of avatars at the top of the
 * home feed, the way the YouTube app's Subscriptions tab opens.
 *
 * Same list, same order, same hidden set as the desktop side rail
 * (lib/rail-channels.ts) — dragging a channel up the rail or hiding one there
 * shows up here too. Hidden from `lg` up, where the rail itself is visible.
 */
export function ChannelStrip() {
  const { channels } = useRailChannels()

  if (channels.length === 0) return null

  return (
    <nav aria-label="Your channels" className="mb-4 lg:hidden">
      <ul className="no-scrollbar swipe-row flex gap-3 overflow-x-auto px-3 pb-1 sm:px-0">
        {channels.map((channel) => (
          <li key={channel.id} className="shrink-0">
            <Link
              href={`/channel/${channel.id}`}
              className="flex w-16 flex-col items-center gap-1.5 rounded-lg py-1 active:bg-accent"
            >
              <Avatar name={channel.title} size={52} />
              <span className="w-full truncate text-center text-[11px] leading-tight text-muted-foreground">
                {channel.title}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
