'use client'

import Image from 'next/image'
import Link from 'next/link'
import { X } from 'lucide-react'

import { progressFraction, useWatchProgress, type ProgressEntry } from '@/lib/watch-progress'

/** A shelf is a glance, not a list. Beyond this, History is the right place. */
const MAX_SHOWN = 12

/**
 * The Continue-watching shelf: videos you started and didn't finish, as a
 * horizontally-scrolling row above the feed.
 *
 * Rendered entirely from localStorage snapshots, so it costs no quota and works
 * offline. It disappears when there's nothing part-watched, rather than sitting
 * there empty — a shelf with a "nothing here" message is worse than no shelf.
 */
export function ContinueWatching() {
  const { resumable, remove } = useWatchProgress()

  if (resumable.length === 0) return null

  return (
    <section className="pb-4">
      <div className="flex items-center justify-between gap-2 px-3 pb-2 sm:px-0">
        <h2 className="truncate text-base font-medium">Keep watching</h2>

        <Link
          href="/history"
          className="shrink-0 rounded-full px-2 py-1 text-sm text-muted-foreground active:bg-accent md:hover:text-foreground"
        >
          History
        </Link>
      </div>

      {/*
        Bleeds to the screen edge on a phone so the last card is visibly cut off —
        that clipped edge is the only thing telling you the row scrolls.
      */}
      <div className="no-scrollbar swipe-row flex gap-3 overflow-x-auto px-3 pb-1 sm:px-0">
        {resumable.slice(0, MAX_SHOWN).map((entry) => (
          <ShelfCard key={entry.video.id} entry={entry} onRemove={() => remove(entry.video.id)} />
        ))}
      </div>
    </section>
  )
}

function ShelfCard({ entry, onRemove }: { entry: ProgressEntry; onRemove: () => void }) {
  const { video } = entry
  const fraction = progressFraction(entry) ?? 0

  const remaining = Math.max(
    0,
    (entry.duration > 0 ? entry.duration : video.durationSeconds) - entry.seconds,
  )

  return (
    <article className="relative w-[15rem] shrink-0 sm:w-[16rem]">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
        {video.thumbnail ? (
          <Image src={video.thumbnail} alt="" fill sizes="256px" className="object-cover" />
        ) : null}

        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1 py-0.5 text-[11px] font-medium leading-tight tabular-nums text-white">
          {formatRemaining(remaining)}
        </span>

        <button
          type="button"
          aria-label={`Remove ${video.title} from Keep watching`}
          onClick={onRemove}
          className="absolute right-1.5 top-1.5 z-10 rounded-full bg-black/70 p-1.5 text-white md:hover:bg-black/90"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-white/30">
          <span
            className="block h-full bg-brand"
            style={{ width: `${Math.round(fraction * 100)}%` }}
          />
        </span>
      </div>

      <h3 className="mt-2 line-clamp-2 text-sm font-medium leading-snug" title={video.title}>
        {video.title}
      </h3>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{video.channelTitle}</p>

      <Link
        href={`/watch?v=${video.id}`}
        className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="sr-only">Resume {video.title}</span>
      </Link>
    </article>
  )
}

/**
 * "8 min left" rather than the video's total length. On a shelf whose entire
 * purpose is finishing things, how much is left is the useful number.
 */
function formatRemaining(seconds: number): string {
  if (seconds < 60) return 'seconds left'

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min left`

  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m left`
}
