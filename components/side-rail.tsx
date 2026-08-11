'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Bookmark, History, Home, Shield, type LucideIcon } from 'lucide-react'

import { Avatar } from '@/components/avatar'
import { useFollowedChannels } from '@/lib/followed-channels'
import { cn } from '@/lib/utils'
import { useWatchLater } from '@/lib/watch-later'

/**
 * The left navigation rail: icons only, each naming itself on hover.
 *
 * 72px wide and never wider. Its width lives in `--rail-w` (app/globals.css) so the
 * fixed rail and the page's left padding are driven by one value and can't drift
 * apart.
 *
 * Shown from `lg` up only, not `md`. Between 768 and 1024 the watch page's player
 * and up-next list already fill the width, and taking another 72px there squeezes
 * both. Below `lg` the bottom dock carries the same destinations.
 */

/**
 * How many followed channels the rail shows.
 *
 * There's a cap because the rail deliberately doesn't scroll: an `overflow-y: auto`
 * container also clips horizontally, which would cut every hover label off at the
 * rail's edge. The full list is managed in the feed's topics panel.
 */
const MAX_RAIL_CHANNELS = 8

export function SideRail() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { saved } = useWatchLater()
  const { followed } = useFollowedChannels()

  const showingSaved = pathname === '/' && searchParams.get('view') === 'saved'

  return (
    <nav
      aria-label="Sections"
      // pt-0 and flush under the app bar: padding here read as a gap between the
      // header and the first icon, which looked like a mistake rather than spacing.
      className="fixed bottom-0 left-0 top-header hidden w-[var(--rail-w)] border-r border-border/60 bg-background px-2 pb-2 lg:block"
    >
      <ul>
        <RailItem href="/" icon={Home} label="Home" active={pathname === '/' && !showingSaved} />
        <RailItem href="/history" icon={History} label="History" active={pathname === '/history'} />
        <RailItem
          href="/?view=saved"
          icon={Bookmark}
          label="Saved"
          active={showingSaved}
          count={saved.length}
        />
      </ul>

      {followed.length > 0 ? (
        <>
          <hr className="my-2 border-border/60" />

          {/* An avatar is already an icon, so following fits the rail unchanged —
              the channel's name is what appears on hover. */}
          <ul>
            {followed.slice(0, MAX_RAIL_CHANNELS).map((channel) => (
              <RailItem
                key={channel.id}
                href={`/channel/${channel.id}`}
                label={channel.title}
                active={pathname === `/channel/${channel.id}`}
              >
                <Avatar name={channel.title} size={24} />
              </RailItem>
            ))}
          </ul>
        </>
      ) : null}

      <hr className="my-2 border-border/60" />

      <ul>
        <RailItem href="/privacy" icon={Shield} label="Privacy" active={pathname === '/privacy'} />
      </ul>
    </nav>
  )
}

type RailItemProps = {
  href: string
  label: string
  active: boolean
  icon?: LucideIcon
  count?: number
  /** An avatar, for channel entries. Takes the icon's place. */
  children?: React.ReactNode
}

function RailItem({ href, label, active, icon: Icon, count, children }: RailItemProps) {
  return (
    <li>
      <Link
        href={href}
        // The name exists only as a hover label, so it has to be on the link for
        // anything that isn't a mouse — screen readers and keyboard users included.
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group relative flex h-14 flex-col items-center justify-center rounded-lg hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          active && 'bg-accent',
        )}
      >
        <span className="relative">
          {Icon ? <Icon className="h-6 w-6" strokeWidth={active ? 2.2 : 1.75} /> : children}

          {count && count > 0 ? (
            <span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-brand px-1 text-[9px] font-medium leading-4 text-white tabular-nums">
              {count > 99 ? '99+' : count}
            </span>
          ) : null}
        </span>

        {/*
          The hover label. A styled flyout rather than the `title` attribute, which
          waits about a second and renders in the OS's own chrome — too slow and too
          foreign for something that is the only way to read the rail. Hidden from
          assistive tech, since aria-label above already carries the name.
        */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-full top-1/2 z-50 ml-1 max-w-48 -translate-y-1/2 truncate rounded-md border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {label}
        </span>
      </Link>
    </li>
  )
}
