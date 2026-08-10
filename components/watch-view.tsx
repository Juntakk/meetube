'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  ExternalLink,
  Share2,
  ThumbsUp,
} from 'lucide-react'

import { Avatar } from '@/components/avatar'
import { Button } from '@/components/ui/button'
import { VideoRow } from '@/components/video-row'
import { YouTubePlayer } from '@/components/youtube-player'
import { usePrefs } from '@/lib/prefs'
import { cn } from '@/lib/utils'
import { useWakeLock } from '@/lib/wake-lock'
import { recordWatch } from '@/lib/watch-history'
import { useWatchLater } from '@/lib/watch-later'
import {
  formatCompactNumber,
  formatRelativeDate,
  type ChannelInfo,
  type VideoResult,
} from '@/lib/youtube'

type WatchViewProps = {
  video: VideoResult
  channel: ChannelInfo | null
  /** The channel's other uploads — YouTube's sidebar, minus the guesswork. */
  related: VideoResult[]
}

/**
 * The watch page, laid out the way YouTube lays it out at each width.
 *
 * Phone: player pinned to the top of the viewport, then title, then the
 * scrollable row of grey action pills, then the channel row, then the list —
 * a single column, everything full width, the player staying put as you scroll
 * the list. Desktop: player and details on the left, the list as a sidebar.
 */
export function WatchView({ video, channel, related }: WatchViewProps) {
  const router = useRouter()
  const { savedIds, toggle: toggleSaved } = useWatchLater()
  const { prefs, set: setPrefs } = usePrefs()
  const [expanded, setExpanded] = React.useState(false)

  // Only on this page: a wake lock held over the feed would be all cost, no use.
  useWakeLock(prefs.keepScreenOn)

  // The strongest taste signal there is, so it feeds the home-feed ranker.
  React.useEffect(() => {
    recordWatch(video)
  }, [video])

  // Collapse the description again when navigating to the next video.
  React.useEffect(() => setExpanded(false), [video.id])

  /*
   * The sidebar always includes the video you're watching, so "next" is the one
   * after it rather than the first — otherwise autoplay would restart the same
   * video forever on a channel's newest upload.
   */
  const index = related.findIndex((item) => item.id === video.id)
  const next = index >= 0 ? related[index + 1] : related[0]

  const handleEnded = React.useCallback(() => {
    if (!prefs.autoplayNext || !next) return
    router.push(`/watch?v=${next.id}`)
  }, [next, prefs.autoplayNext, router])

  const share = React.useCallback(async () => {
    const url = `${window.location.origin}/watch?v=${video.id}`

    try {
      if (navigator.share) {
        await navigator.share({ title: video.title, url })
      } else {
        await navigator.clipboard.writeText(url)
      }
    } catch {
      // Cancelled, or clipboard blocked. Not worth interrupting for.
    }
  }, [video.id, video.title])

  const isSaved = savedIds.has(video.id)

  const stats = [
    video.viewCount !== null ? `${formatCompactNumber(video.viewCount)} views` : null,
    formatRelativeDate(video.publishedAt),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="mx-auto grid w-full max-w-[1600px] md:grid-cols-[minmax(0,1fr)_min(400px,34%)] md:gap-6 md:px-4">
      <div className="min-w-0">
        {/*
          Pinned under the app bar on a phone, exactly as the YouTube app pins
          it: you can browse the rest of the channel without losing the video.
          Static from md up, where the sidebar makes pinning pointless.
        */}
        <div className="sticky top-header z-20 bg-background md:static">
          <YouTubePlayer videoId={video.id} title={video.title} onEnded={handleEnded} />
        </div>

        <div className="px-3 pt-3 md:px-0">
          {/*
            One tap target covering title and stats, as on YouTube — tapping
            anywhere in this block opens the full description.
          */}
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            className="w-full text-left"
          >
            <h1
              className={cn(
                'text-lg font-medium leading-snug md:text-xl',
                !expanded && 'line-clamp-2',
              )}
            >
              {video.title}
            </h1>

            <p className="mt-1 flex items-center gap-1 text-[0.8125rem] text-muted-foreground">
              <span className="truncate">{stats}</span>
              <span className="shrink-0 font-medium text-foreground">
                {expanded ? 'less' : '…more'}
              </span>
              <ChevronDown
                className={cn('h-4 w-4 shrink-0 transition-transform', expanded && 'rotate-180')}
                aria-hidden
              />
            </p>
          </button>

          {expanded && video.description ? (
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
              {video.description}
            </p>
          ) : null}

          {/* The channel row: avatar, name, subscriber count, and the way in. */}
          <div className="mt-4 flex items-center gap-3">
            <Link
              href={`/channel/${video.channelId}`}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-full"
            >
              {channel?.avatar ? (
                <Image
                  src={channel.avatar}
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 shrink-0 rounded-full"
                />
              ) : (
                <Avatar name={channel?.title ?? video.channelTitle} size={40} />
              )}

              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {channel?.title ?? video.channelTitle}
                </span>
                {channel?.subscriberCount !== null && channel?.subscriberCount !== undefined ? (
                  <span className="block text-xs text-muted-foreground">
                    {formatCompactNumber(channel.subscriberCount)} subscribers
                  </span>
                ) : null}
              </span>
            </Link>

            {/*
              Where YouTube puts Subscribe. MeeTube's YouTube access is read-only
              by design — it can't subscribe — so the same slot goes to the one
              thing it can do with a channel.
            */}
            <Button asChild size="pill" className="shrink-0">
              <Link href={`/channel/${video.channelId}`}>Videos</Link>
            </Button>
          </div>

          {/*
            YouTube's grey pill row. Scrolls horizontally rather than wrapping,
            so it stays one line on the narrowest phone.
          */}
          <div className="no-scrollbar swipe-row -mx-3 mt-3 flex gap-2 overflow-x-auto px-3 pb-1 md:mx-0 md:px-0">
            {video.likeCount !== null ? (
              // A span, not a button: liking needs write access this app doesn't
              // ask for, and a button that does nothing is worse than a figure.
              <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-secondary px-3.5 text-sm font-medium text-secondary-foreground">
                <ThumbsUp className="h-4 w-4" aria-hidden />
                {formatCompactNumber(video.likeCount)}
              </span>
            ) : null}

            <Button
              variant={isSaved ? 'default' : 'pill'}
              size="pill"
              className="shrink-0"
              onClick={() => toggleSaved(video)}
              aria-pressed={isSaved}
            >
              {isSaved ? <BookmarkCheck /> : <Bookmark />}
              {isSaved ? 'Saved' : 'Save'}
            </Button>

            <Button variant="pill" size="pill" className="shrink-0" onClick={share}>
              <Share2 />
              Share
            </Button>

            <Button variant="pill" size="pill" className="shrink-0" asChild>
              <a
                href={`https://www.youtube.com/watch?v=${video.id}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                <ExternalLink />
                YouTube
              </a>
            </Button>
          </div>
        </div>
      </div>

      <aside className="mt-4 min-w-0 md:mt-0">
        <div className="flex items-center justify-between gap-2 px-3 pb-2 md:px-0">
          <h2 className="min-w-0 truncate text-sm font-medium">
            More from{' '}
            <Link href={`/channel/${video.channelId}`} className="underline-offset-4 hover:underline">
              {channel?.title ?? video.channelTitle}
            </Link>
          </h2>

          {/* No quota implication either way, so it's a plain toggle. */}
          <label className="flex shrink-0 cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={prefs.autoplayNext}
              onChange={(event) => setPrefs({ autoplayNext: event.target.checked })}
              className="h-4 w-4 accent-brand"
            />
            Autoplay
          </label>
        </div>

        {related.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No other videos from this channel.
          </p>
        ) : (
          <div className="md:space-y-1">
            {related.map((item) => (
              <VideoRow
                key={item.id}
                video={item}
                active={item.id === video.id}
                showChannel={false}
              />
            ))}
          </div>
        )}
      </aside>
    </div>
  )
}
