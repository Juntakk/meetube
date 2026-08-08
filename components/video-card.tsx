'use client'

import Image from 'next/image'
import { Bookmark, BookmarkCheck } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatCompactNumber, formatRelativeDate, type VideoResult } from '@/lib/youtube'

type VideoCardProps = {
  video: VideoResult
  onSelect: (video: VideoResult) => void
  onChannelSelect?: (video: VideoResult) => void
  onToggleSave?: (video: VideoResult) => void
  isSaved?: boolean
}

export function VideoCard({
  video,
  onSelect,
  onChannelSelect,
  onToggleSave,
  isSaved = false,
}: VideoCardProps) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onSelect(video)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(video)
        }
      }}
      className="group relative cursor-pointer overflow-hidden border-border/60 transition-colors hover:border-border hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {video.thumbnail ? (
          <Image
            src={video.thumbnail}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : null}

        <span className="absolute bottom-2 right-2 rounded bg-black/85 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">
          {video.duration}
        </span>

        {onToggleSave ? (
          <button
            type="button"
            aria-label={isSaved ? 'Remove from Watch later' : 'Save to Watch later'}
            aria-pressed={isSaved}
            // Stop the click bubbling to the card, which would open the player.
            onClick={(event) => {
              event.stopPropagation()
              onToggleSave(video)
            }}
            className={cn(
              'absolute right-2 top-2 rounded-md bg-black/70 p-1.5 text-white backdrop-blur transition-opacity hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              // Always visible once saved, and on touch devices where hover doesn't exist.
              isSaved ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 max-md:opacity-100',
            )}
          >
            {isSaved ? (
              <BookmarkCheck className="h-4 w-4 text-primary" />
            ) : (
              <Bookmark className="h-4 w-4" />
            )}
          </button>
        ) : null}
      </div>

      <div className="space-y-1 p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug" title={video.title}>
          {video.title}
        </h3>

        {onChannelSelect ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onChannelSelect(video)
            }}
            className="block max-w-full truncate text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            title={`See videos from ${video.channelTitle}`}
          >
            {video.channelTitle}
          </button>
        ) : (
          <p className="truncate text-xs text-muted-foreground">{video.channelTitle}</p>
        )}

        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          {video.viewCount !== null ? (
            <>
              <span>{formatCompactNumber(video.viewCount)} views</span>
              <span aria-hidden>&middot;</span>
            </>
          ) : null}
          <span>{formatRelativeDate(video.publishedAt)}</span>
        </p>
      </div>
    </Card>
  )
}
