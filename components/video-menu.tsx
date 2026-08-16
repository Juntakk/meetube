'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell,
  Bookmark,
  BookmarkCheck,
  CornerUpRight,
  ExternalLink,
  ListEnd,
  ListVideo,
  Plus,
  Share2,
  User,
  type LucideIcon,
} from 'lucide-react'

import { useFollowedChannels } from '@/lib/followed-channels'
import { useQueue } from '@/lib/queue'
import { useWatchLater } from '@/lib/watch-later'
import type { VideoResult } from '@/lib/youtube'

/**
 * The ⋮ overflow menu on a feed item: a small panel anchored to the button that
 * opened it, the way youtube.com does it — not a modal in the middle of the page.
 *
 * One instance for the whole page rather than one per card: a 48-item feed would
 * otherwise carry 48 menus' worth of state and 48 subscriptions each to the saved,
 * followed and queue stores. The open request travels as a window event carrying
 * the button's rect, which is what lets a single shared panel know where to go.
 */

const OPEN_EVENT = 'meetube:video-menu'

/** Where the menu should appear, and what it should act on. */
type OpenRequest = { video: VideoResult; anchor: DOMRect }

/** Panel geometry. Fixed rather than measured so placement needs no second pass. */
const MENU_WIDTH = 232
const MENU_MARGIN = 8

/**
 * @param anchor the kebab button's bounding rect, so the menu can open against it
 * rather than in the middle of the screen.
 */
export function openVideoMenu(video: VideoResult, anchor: DOMRect) {
  window.dispatchEvent(new CustomEvent<OpenRequest>(OPEN_EVENT, { detail: { video, anchor } }))
}

/**
 * Places the panel against the button, flipping rather than overflowing.
 *
 * Right edges are aligned because the kebab sits at the right edge of a card, so
 * the menu opens leftward into the card it belongs to. Vertically it prefers to
 * hang below and flips above when the button is near the bottom of the viewport —
 * which is most of them, in a feed you have scrolled.
 */
function place(anchor: DOMRect, height: number) {
  const left = Math.min(
    Math.max(MENU_MARGIN, anchor.right - MENU_WIDTH),
    window.innerWidth - MENU_WIDTH - MENU_MARGIN,
  )

  const below = anchor.bottom + 4
  const fitsBelow = below + height <= window.innerHeight - MENU_MARGIN
  const top = fitsBelow
    ? below
    : Math.max(MENU_MARGIN, anchor.top - height - 4)

  return { left, top }
}

export function VideoMenu() {
  const router = useRouter()
  const { savedIds, toggle } = useWatchLater()
  const { followedIds, toggle: toggleFollow } = useFollowedChannels()
  const { queuedIds, add: addToQueue, playNext, remove: removeFromQueue } = useQueue()
  const [request, setRequest] = React.useState<OpenRequest | null>(null)
  const panelRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    const onOpen = (event: Event) => setRequest((event as CustomEvent<OpenRequest>).detail)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  const close = React.useCallback(() => setRequest(null), [])

  /*
   * Escape closes, and so does scrolling: the panel is positioned against a rect
   * captured at open time, so once the page moves underneath it that position is
   * a lie. Closing is both simpler and less jarring than chasing the button.
   */
  React.useEffect(() => {
    if (!request) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [request, close])

  // Focus the panel on open so Escape and Tab land somewhere sensible.
  React.useEffect(() => {
    if (request) panelRef.current?.focus()
  }, [request])

  if (!request) return null

  const { video, anchor } = request

  const isSaved = savedIds.has(video.id)
  const isFollowing = followedIds.has(video.channelId)
  const isQueued = queuedIds.has(video.id)
  const watchUrl = `https://www.youtube.com/watch?v=${video.id}`

  const share = async () => {
    const url = `${window.location.origin}/watch?v=${video.id}`

    try {
      // The real share sheet where there is one — iOS and Android both have it.
      if (navigator.share) {
        await navigator.share({ title: video.title, url })
      } else {
        await navigator.clipboard.writeText(url)
      }
    } catch {
      // Cancelled, or clipboard blocked. Nothing worth interrupting for.
    }

    close()
  }

  /*
   * Estimated from the row count rather than measured. Measuring would need a
   * render at an unknown position first, and a frame of the panel sitting in the
   * wrong place is worse than being a few pixels out on the flip decision.
   */
  const rows = 6 + (video.channelId ? 1 : 0)
  const { left, top } = place(anchor, rows * 40 + 8)

  return (
    <>
      {/*
        Catches the click that dismisses. Transparent rather than dimmed: this is
        a menu, not a modal, and darkening the page for it would overstate it.
      */}
      <div className="fixed inset-0 z-50" onClick={close} aria-hidden />

      <div
        ref={panelRef}
        role="menu"
        aria-label={`Actions for ${video.title}`}
        tabIndex={-1}
        style={{ left, top, width: MENU_WIDTH }}
        className="fixed z-50 overflow-hidden rounded-xl border bg-popover py-1.5 shadow-xl focus:outline-none"
      >
        {/*
          Both queue actions, in YouTube's own order and wording. "Play next"
          jumps the line; "Add to queue" joins the back of it.
        */}
        <MenuItem
          icon={CornerUpRight}
          label="Play next"
          onClick={() => {
            playNext(video)
            close()
          }}
        />

        <MenuItem
          icon={isQueued ? ListVideo : ListEnd}
          label={isQueued ? 'Remove from queue' : 'Add to queue'}
          onClick={() => {
            if (isQueued) removeFromQueue(video.id)
            else addToQueue(video)
            close()
          }}
        />

        <MenuItem
          icon={isSaved ? BookmarkCheck : Bookmark}
          label={isSaved ? 'Remove from Saved' : 'Save to Saved'}
          onClick={() => {
            toggle(video)
            close()
          }}
        />

        {video.channelId ? (
          <MenuItem
            icon={isFollowing ? Bell : Plus}
            label={isFollowing ? `Unfollow ${video.channelTitle}` : `Follow ${video.channelTitle}`}
            onClick={() => {
              toggleFollow({ id: video.channelId, title: video.channelTitle })
              close()
            }}
          />
        ) : null}

        <MenuItem
          icon={User}
          label={`Go to ${video.channelTitle}`}
          onClick={() => {
            close()
            router.push(`/channel/${video.channelId}`)
          }}
        />

        <MenuItem icon={Share2} label="Share" onClick={share} />

        <MenuItem
          icon={ExternalLink}
          label="Open on YouTube"
          onClick={() => {
            window.open(watchUrl, '_blank', 'noopener,noreferrer')
            close()
          }}
        />
      </div>
    </>
  )
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      // 40px rows, as on youtube.com. The old 48px was sized for a full-width
      // dialog list; in a 232px panel anchored to a button it reads as padding.
      className="flex h-10 w-full items-center gap-3 px-3 text-left text-sm active:bg-accent md:hover:bg-accent"
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  )
}
