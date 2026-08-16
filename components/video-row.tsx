'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { MoreVertical } from 'lucide-react'

import { Avatar } from '@/components/avatar'
import { openVideoMenu } from '@/components/video-menu'
import { cn } from '@/lib/utils'
import { useWatchHistory } from '@/lib/watch-history'
import { progressFraction, useWatchProgress } from '@/lib/watch-progress'
import { formatCompactNumber, formatRelativeDate, type VideoResult } from '@/lib/youtube'

type VideoRowProps = {
  video: VideoResult
  /** Marks the video currently playing, so the list shows where you are. */
  active?: boolean
  /** Hidden when every item in the list is from the same channel anyway. */
  showChannel?: boolean
}

/**
 * A list item in the "up next" list beside — or, on a phone, below — the player.
 *
 * The two shapes YouTube uses for that list, in one component. On a phone the
 * list under the player is full-width cards identical to the feed's; from `md` up
 * the sidebar appears and each item becomes the wide, short thumbnail-left row.
 * One component rather than two rendered behind media queries, so there's only
 * ever one image element per video on the page.
 */
export function VideoRow({ video, active = false, showChannel = true }: VideoRowProps) {
  const { history } = useWatchHistory()
  const { byId } = useWatchProgress()

  const inHistory = React.useMemo(
    () => history.some((entry) => entry.id === video.id),
    [history, video.id],
  )

  // Recorded position where there is one, else a full bar for anything opened.
  const fraction = progressFraction(byId.get(video.id))
  const progress = fraction ?? (inHistory ? 1 : null)

  const meta = [
    video.viewCount !== null ? `${formatCompactNumber(video.viewCount)} views` : null,
    formatRelativeDate(video.publishedAt),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <article
      aria-current={active ? 'true' : undefined}
      className={cn(
        'group relative flex flex-col md:flex-row md:gap-2.5 md:rounded-xl md:p-1.5',
        active ? 'md:bg-accent' : 'md:hover:bg-accent/50',
      )}
    >
      <div className="relative aspect-video w-full shrink-0 overflow-hidden bg-muted md:w-[168px] md:rounded-xl">
        {video.thumbnail ? (
          <Image
            src={video.thumbnail}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 168px"
            className="object-cover"
          />
        ) : null}

        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1 py-0.5 text-[11px] font-medium leading-tight tabular-nums text-white md:bottom-1 md:right-1">
          {video.duration}
        </span>

        {progress !== null ? (
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-white/30">
            <span
              className="block h-full bg-brand"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 gap-3 px-3 pb-3 pt-2.5 md:gap-1 md:px-0 md:pb-0 md:pt-0">
        {/* The sidebar row has no avatar; the phone's full-width card does. */}
        <Avatar name={video.channelTitle} size={36} className="mt-0.5 md:hidden" />

        <div className="min-w-0 flex-1">
          <h3
            className={cn(
              'line-clamp-2 text-[0.9375rem] font-medium leading-[1.35] md:text-sm',
              active && 'text-primary',
            )}
            title={video.title}
          >
            {video.title}
          </h3>

          {/* Phone: one truncated line carrying everything, as in the app. */}
          <p className="mt-1 truncate text-[0.8125rem] text-muted-foreground md:hidden">
            {showChannel ? `${video.channelTitle}${meta ? ' · ' : ''}` : null}
            {meta}
          </p>

          {showChannel ? (
            <p className="hidden truncate text-xs text-muted-foreground md:block">
              {video.channelTitle}
            </p>
          ) : null}
          <p className="hidden truncate text-xs text-muted-foreground md:block">{meta}</p>

          {active ? (
            <p className="mt-1 text-xs font-medium text-muted-foreground md:hidden">Now playing</p>
          ) : null}
        </div>

        <button
          type="button"
          aria-label={`More options for ${video.title}`}
          onClick={(event) => openVideoMenu(video, event.currentTarget.getBoundingClientRect())}
          className="relative z-10 -mr-1.5 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground active:bg-accent md:hidden"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </div>

      <Link
        href={`/watch?v=${video.id}`}
        className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="sr-only">{video.title}</span>
      </Link>
    </article>
  )
}
