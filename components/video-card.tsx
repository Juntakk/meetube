'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Bookmark, BookmarkCheck, MoreVertical, X } from 'lucide-react'

import { Avatar } from '@/components/avatar'
import { openVideoMenu } from '@/components/video-menu'
import { cn } from '@/lib/utils'
import { useWatchHistory } from '@/lib/watch-history'
import { useWatchLater } from '@/lib/watch-later'
import { progressFraction, useWatchProgress } from '@/lib/watch-progress'
import { formatCompactNumber, formatRelativeDate, type VideoResult } from '@/lib/youtube'

type VideoCardProps = {
  video: VideoResult
  /** Why the home feed picked this, shown as YouTube shows "Because you watched". */
  reason?: string
  /** The first few cards get eager images; the rest lazy-load on scroll. */
  priority?: boolean
  /**
   * Renders a dismiss button on the thumbnail instead of the save button. Only
   * the History grid passes this — "remove this entry" is the action that matters
   * there, and two buttons in one corner is one too many.
   */
  onRemove?: (video: VideoResult) => void
}

/**
 * A feed item, drawn the way the YouTube app draws one.
 *
 * On a phone the thumbnail runs edge to edge with no border, no card and no
 * shadow, and the information sits under it beside a channel avatar. That
 * full-bleed thumbnail is most of what makes the feed feel like the app rather
 * than a web page in a grid of boxes. From `sm` up it becomes a rounded tile in
 * a multi-column grid, which is what youtube.com does at the same width.
 */
export function VideoCard({ video, reason, priority = false, onRemove }: VideoCardProps) {
  const { savedIds, toggle } = useWatchLater()
  const { history } = useWatchHistory()
  const { byId } = useWatchProgress()

  const isSaved = savedIds.has(video.id)

  /*
   * YouTube's red bar under the thumbnail. The recorded position when we have
   * one; otherwise a full bar for anything merely known to have been opened,
   * which covers videos watched before positions were tracked and any watch too
   * short to record.
   */
  const inHistory = React.useMemo(
    () => history.some((entry) => entry.id === video.id),
    [history, video.id],
  )

  const fraction = progressFraction(byId.get(video.id))
  const progress = fraction ?? (inHistory ? 1 : null)

  const meta = [
    video.viewCount !== null ? `${formatCompactNumber(video.viewCount)} views` : null,
    formatRelativeDate(video.publishedAt),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <article className="group relative">
      <div className="relative aspect-video w-full overflow-hidden bg-muted sm:rounded-xl">
        {video.thumbnail ? (
          <Image
            src={video.thumbnail}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            priority={priority}
            className="object-cover"
          />
        ) : null}

        {/* Absent for history recorded before snapshots existed, and an empty
            black pill in the corner looks like a rendering fault. */}
        {video.duration ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1 py-0.5 text-[11px] font-medium leading-tight tabular-nums text-white">
            {video.duration}
          </span>
        ) : null}

        {progress !== null ? (
          // The track is drawn too, so a bar at 15% reads as "15% through" rather
          // than as a stray red mark in the corner.
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-white/30">
            <span
              className="block h-full bg-brand"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </span>
        ) : null}

        {onRemove ? (
          // Always visible, unlike the save button: on a phone this is the only
          // way to remove an entry, so it can't hide behind hover.
          <button
            type="button"
            aria-label={`Remove ${video.title} from history`}
            onClick={() => onRemove(video)}
            className="absolute right-1.5 top-1.5 z-10 rounded-full bg-black/70 p-2 text-white md:hover:bg-black/90"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          /*
            Hover-only, and desktop-only: YouTube puts no controls on a phone
            thumbnail, where the whole tile has to be one tap target.
          */
          <button
            type="button"
            aria-label={isSaved ? 'Remove from Saved' : 'Save to Saved'}
            aria-pressed={isSaved}
            onClick={() => toggle(video)}
            className={cn(
              'absolute right-1.5 top-1.5 z-10 hidden rounded-full bg-black/70 p-2 text-white transition-opacity hover:bg-black/90 md:block',
              isSaved
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
            )}
          >
            {isSaved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
          </button>
        )}
      </div>

      <div className="flex gap-3 px-3 pb-3 pt-2.5 sm:mt-3 sm:px-0 sm:pb-0 sm:pt-0">
        {/*
          The API's search and playlist responses carry no channel avatar, and
          fetching one per card would be a quota call per card. Initials in the
          channel's own stable colour fill the same slot at no cost.
        */}
        <Avatar name={video.channelTitle} size={36} className="mt-0.5" />

        <div className="min-w-0 flex-1">
          <h3
            className="line-clamp-2 text-[0.9375rem] font-medium leading-[1.35] sm:text-sm"
            title={video.title}
          >
            {video.title}
          </h3>

          {/* Phone: channel, views and age on one truncated line, as in the app. */}
          <p className="mt-1 truncate text-[0.8125rem] text-muted-foreground sm:hidden">
            {video.channelTitle}
            {meta ? ` · ${meta}` : null}
          </p>

          {/* Desktop: the channel gets its own line and is a link, as on the site. */}
          <Link
            href={`/channel/${video.channelId}`}
            className="relative z-10 mt-1 hidden truncate text-xs text-muted-foreground hover:text-foreground sm:block"
          >
            {video.channelTitle}
          </Link>
          <p className="hidden truncate text-xs text-muted-foreground sm:block">{meta}</p>

          {reason ? (
            <p className="mt-1 truncate text-xs text-muted-foreground/80" title={reason}>
              {reason}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          aria-label={`More options for ${video.title}`}
          onClick={() => openVideoMenu(video)}
          // z-10 keeps it above the overlay link that covers the rest of the card.
          className="relative z-10 -mr-1.5 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground active:bg-accent md:hover:bg-accent"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </div>

      {/*
        The tap target for the whole card. An overlay rather than a wrapper,
        because the channel link and the ⋮ button sit inside the same area and
        nesting them inside an <a> would be invalid HTML.
      */}
      <Link
        href={`/watch?v=${video.id}`}
        className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="sr-only">{video.title}</span>
      </Link>
    </article>
  )
}
