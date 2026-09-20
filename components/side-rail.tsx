'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Bookmark, History, Home, Shield, type LucideIcon } from 'lucide-react'

import { Avatar } from '@/components/avatar'
import { ProfileSwitcher } from '@/components/profile-switcher'
import { FEED_CHANNELS } from '@/lib/channel-feed'
import { useFollowedChannels } from '@/lib/followed-channels'
import { useProfiles } from '@/lib/profiles'
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
 *
 * Every channel in the home feed gets a shortcut here — the whole list, not a
 * capped preview, so this is at least a dozen-plus items on top of the three
 * fixed ones. The rail itself stays pinned edge-to-edge; only the channel list
 * in the middle scrolls once it's taller than the viewport.
 */

export function SideRail() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { saved } = useWatchLater()
  const { followed, reorder } = useFollowedChannels()
  const { profiles, activeId } = useProfiles()
  const [switcherOpen, setSwitcherOpen] = React.useState(false)
  const activeProfile = profiles.find((profile) => profile.id === activeId)

  const showingSaved = pathname === '/' && searchParams.get('view') === 'saved'

  // Followed channels not already in the feed list — no point showing the same
  // shortcut twice.
  const feedIds = new Set(FEED_CHANNELS.map((channel) => channel.id))
  const extraFollowed = followed.filter((channel) => !feedIds.has(channel.id))

  /*
   * Drag-and-drop reordering, mouse-only native HTML5 DnD — fine, since this
   * rail only ever renders from `lg` up, where there's no touch input to
   * support anyway. Only the channels you've actually followed are
   * reorderable: FEED_CHANNELS is a fixed list from code, with no per-user
   * order to persist.
   */
  const [draggingId, setDraggingId] = React.useState<string | null>(null)
  const [dragOverId, setDragOverId] = React.useState<string | null>(null)

  return (
    <nav
      aria-label="Sections"
      // pt-0 and flush under the app bar: padding here read as a gap between the
      // header and the first icon, which looked like a mistake rather than spacing.
      // A column flex box so the channel list (the one part with an unbounded
      // length) is the only region that scrolls — Home/History/Saved stay
      // pinned at the top and Privacy stays pinned at the bottom regardless of
      // how many channels are in the feed.
      className="fixed bottom-0 left-0 top-header hidden w-[var(--rail-w)] flex-col border-r border-border/60 bg-background px-2 pb-2 lg:flex"
    >
      <ul className="shrink-0">
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

      <hr className="my-2 shrink-0 border-border/60" />

      {/*
        min-h-0 is load-bearing on a flex child: without it this list refuses to
        shrink below its content height, which pushes Privacy off the bottom of
        the rail instead of letting this region scroll on its own.

        An avatar is already an icon, so a channel fits the rail unchanged — its
        name is what appears on hover. The hover label is portaled to <body> in
        RailItem rather than living in this container, precisely because this
        container scrolls: an overflow-y-auto ancestor also clips overflow-x
        (there's no way to have one axis scroll and the other stay visible), so
        anything positioned the ordinary way — absolute, inside this box — would
        get its label cut off at the rail's edge the moment it needed scrolling
        to reach.
      */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <ul>
          {FEED_CHANNELS.map((channel) => (
            <RailItem
              key={channel.id}
              href={`/channel/${channel.id}`}
              label={channel.title}
              active={pathname === `/channel/${channel.id}`}
            >
              <Avatar name={channel.title} size={24} />
            </RailItem>
          ))}

          {extraFollowed.map((channel) => (
            <RailItem
              key={channel.id}
              href={`/channel/${channel.id}`}
              label={channel.title}
              active={pathname === `/channel/${channel.id}`}
              drag={{
                dragging: draggingId === channel.id,
                dragOver: dragOverId === channel.id && draggingId !== channel.id,
                onDragStart: () => setDraggingId(channel.id),
                onDragEnter: () => {
                  if (draggingId && draggingId !== channel.id) setDragOverId(channel.id)
                },
                onDragEnd: () => {
                  setDraggingId(null)
                  setDragOverId(null)
                },
                onDrop: () => {
                  if (draggingId && draggingId !== channel.id) reorder(draggingId, channel.id)
                  setDraggingId(null)
                  setDragOverId(null)
                },
              }}
            >
              <Avatar name={channel.title} size={24} />
            </RailItem>
          ))}
        </ul>
      </div>

      <hr className="my-2 shrink-0 border-border/60" />

      <ul className="shrink-0">
        {activeProfile ? (
          <RailItem
            label={`${activeProfile.name} — switch profile`}
            active={false}
            onClick={() => setSwitcherOpen(true)}
          >
            <Avatar name={activeProfile.name} seed={activeProfile.id} size={24} />
          </RailItem>
        ) : null}
        <RailItem href="/privacy" icon={Shield} label="Privacy" active={pathname === '/privacy'} />
      </ul>

      <ProfileSwitcher open={switcherOpen} onOpenChange={setSwitcherOpen} />
    </nav>
  )
}

type RailItemProps = {
  /** Either this or `onClick` — a navigation entry or a button entry (the profile switcher). */
  href?: string
  onClick?: () => void
  label: string
  active: boolean
  icon?: LucideIcon
  count?: number
  /** An avatar, for channel and profile entries. Takes the icon's place. */
  children?: React.ReactNode
  /** Present only for a followed channel — see the drag state in SideRail. */
  drag?: {
    dragging: boolean
    dragOver: boolean
    onDragStart: () => void
    onDragEnter: () => void
    onDragEnd: () => void
    onDrop: () => void
  }
}

function RailItem({ href, onClick, label, active, icon: Icon, count, children, drag }: RailItemProps) {
  const triggerRef = React.useRef<HTMLAnchorElement | HTMLButtonElement | null>(null)
  /** Set to the trigger's own rect while shown; null hides it. Its position doubles as "is it open". */
  const [rect, setRect] = React.useState<DOMRect | null>(null)

  const show = () => setRect(triggerRef.current?.getBoundingClientRect() ?? null)
  const hide = () => setRect(null)

  /*
   * A position captured on hover goes stale the instant the channel list
   * scrolls — nothing re-renders this component just because its ancestor's
   * scrollTop changed. Hiding on scroll is simpler than tracking and
   * recomputing a position that's about to move anyway.
   */
  React.useEffect(() => {
    if (!rect) return

    const onScroll = () => hide()
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => window.removeEventListener('scroll', onScroll, { capture: true })
  }, [rect])

  return (
    <li
      draggable={Boolean(drag)}
      onDragStart={drag?.onDragStart}
      onDragEnter={drag?.onDragEnter}
      // A dragover has to be prevented for this element to become a valid
      // drop target at all — the one non-obvious step in native HTML5 DnD.
      onDragOver={drag ? (event) => event.preventDefault() : undefined}
      onDragEnd={drag?.onDragEnd}
      onDrop={
        drag
          ? (event) => {
              event.preventDefault()
              drag.onDrop()
            }
          : undefined
      }
      className={cn(
        drag && 'cursor-grab active:cursor-grabbing',
        drag?.dragging && 'opacity-40',
        drag?.dragOver && 'rounded-lg outline outline-2 outline-offset-[-2px] outline-brand',
      )}
    >
      {href ? (
        <Link
          ref={(node) => {
            triggerRef.current = node
          }}
          href={href}
          // The name exists only as a hover label, so it has to be on the trigger
          // for anything that isn't a mouse — screen readers and keyboard users included.
          aria-label={label}
          aria-current={active ? 'page' : undefined}
          onMouseEnter={show}
          onMouseLeave={hide}
          onFocus={show}
          onBlur={hide}
          className={triggerClassName(active)}
        >
          <TriggerContent icon={Icon} count={count} active={active}>
            {children}
          </TriggerContent>
        </Link>
      ) : (
        <button
          type="button"
          ref={(node) => {
            triggerRef.current = node
          }}
          onClick={onClick}
          aria-label={label}
          onMouseEnter={show}
          onMouseLeave={hide}
          onFocus={show}
          onBlur={hide}
          className={triggerClassName(active)}
        >
          <TriggerContent icon={Icon} count={count} active={active}>
            {children}
          </TriggerContent>
        </button>
      )}

      {/*
        Portaled to <body> and positioned in viewport coordinates (`fixed`),
        so it renders outside the channel list's scroll container entirely —
        nothing there can clip it, whatever the list's own overflow rules are.
        Hidden from assistive tech, since aria-label above already carries the
        name; shows and hides with no transition, since a delay is exactly
        what a hover label on a 72px icon-only rail can't afford.
      */}
      {rect
        ? createPortal(
            <span
              aria-hidden
              style={{ left: rect.right + 4, top: rect.top + rect.height / 2 }}
              className="pointer-events-none fixed z-50 max-w-48 -translate-y-1/2 truncate rounded-md border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-lg"
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </li>
  )
}

function triggerClassName(active: boolean) {
  return cn(
    'relative flex h-14 w-full flex-col items-center justify-center rounded-lg hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    active && 'bg-accent',
  )
}

function TriggerContent({
  icon: Icon,
  count,
  active,
  children,
}: {
  icon?: LucideIcon
  count?: number
  active: boolean
  children?: React.ReactNode
}) {
  return (
    <span className="relative">
      {Icon ? <Icon className="h-6 w-6" strokeWidth={active ? 2.2 : 1.75} /> : children}

      {count && count > 0 ? (
        <span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-brand px-1 text-[9px] font-medium leading-4 text-white tabular-nums">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </span>
  )
}
