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
  ListVideo,
  Share2,
  ThumbsUp,
  X,
} from 'lucide-react'

import { Avatar } from '@/components/avatar'
import { FollowButton } from '@/components/follow-button'
import { Button } from '@/components/ui/button'
import { VideoRow } from '@/components/video-row'
import { YouTubePlayer } from '@/components/youtube-player'
import { usePrefs } from '@/lib/prefs'
import { dequeue, peekQueue, useQueue } from '@/lib/queue'
import { cn } from '@/lib/utils'
import { useWakeLock } from '@/lib/wake-lock'
import { recordWatch } from '@/lib/watch-history'
import { useWatchLater } from '@/lib/watch-later'
import { readResumeSeconds, recordProgress } from '@/lib/watch-progress'
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
  const { queue, remove: removeFromQueue, clear: clearQueue } = useQueue()
  const [expanded, setExpanded] = React.useState(false)

  // Only on this page: a wake lock held over the feed would be all cost, no use.
  useWakeLock(prefs.keepScreenOn)

  // The strongest taste signal there is, so it feeds the home-feed ranker.
  React.useEffect(() => {
    recordWatch(video)
  }, [video])

  /*
   * Whatever is playing is no longer waiting to play. Runs however you arrived —
   * autoplay, a tap in the queue panel, or a shared link — so the queue always
   * reads as what is still to come.
   */
  React.useEffect(() => {
    dequeue(video.id)
  }, [video.id])

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
    /*
     * The queue wins, and it ignores the Autoplay toggle on purpose: queueing a
     * video is an explicit instruction to play it next, where autoplay is a
     * standing preference about what to do when nothing was asked for. YouTube
     * draws the line in the same place.
     *
     * Read at fire time rather than from the hook, so a queue edited during
     * playback is honoured rather than whatever it held when this was built.
     */
    const queued = peekQueue()
    if (queued) {
      router.push(`/watch?v=${queued.id}`)
      return
    }

    // Nothing queued: fall back to this channel's next upload, if allowed.
    if (!prefs.autoplayNext || !next) return
    router.push(`/watch?v=${next.id}`)
  }, [next, prefs.autoplayNext, router])

  /*
   * Ignore anything reported for a video other than the one on screen. On
   * autoplay-next this component's `video` becomes the next one while the old
   * player is still shutting down, and its parting report would otherwise be
   * filed against the new video — starting it 20 minutes in.
   */
  const handleProgress = React.useCallback(
    (reportedId: string, seconds: number, duration: number) => {
      if (reportedId !== video.id) return
      recordProgress(video, seconds, duration)
    },
    [video],
  )

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
          <YouTubePlayer
            videoId={video.id}
            title={video.title}
            onEnded={handleEnded}
            getStartSeconds={readResumeSeconds}
            onProgress={handleProgress}
          />
        </div>

        <div className="px-3 pt-3 md:px-0">
          {/* 20px/600, which is what youtube.com sets a watch-page title at. */}
          <h1 className="text-lg font-semibold leading-tight md:text-xl">{video.title}</h1>

          {/*
            Channel and actions share one row from md up and stack below it, which
            is the split youtube.com makes at the same point.
          */}
          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* The channel row: avatar, name, subscriber count, and the way in. */}
          <div className="flex items-center gap-3">
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

            {/* Where YouTube puts Subscribe, doing the local equivalent. */}
            <FollowButton
              channelId={video.channelId}
              title={channel?.title ?? video.channelTitle}
              avatar={channel?.avatar || undefined}
              className="shrink-0"
            />
          </div>

          {/*
            YouTube's grey pill row. Scrolls horizontally rather than wrapping,
            so it stays one line on the narrowest phone.
          */}
          <div className="no-scrollbar swipe-row -mx-3 flex gap-2 overflow-x-auto px-3 pb-1 md:mx-0 md:shrink-0 md:px-0">
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

          {/*
            The description panel, as youtube.com draws it: a filled grey block
            holding the view count and age in bold, then the description clamped to
            three lines behind a "...more". The whole block is the toggle — on
            YouTube you can click anywhere in the collapsed panel to open it.
          */}
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            className={cn(
              'mt-3 w-full rounded-xl bg-secondary p-3 text-left text-sm md:hover:bg-accent',
              // Once open, clicking the body would collapse it mid-read, so only
              // the trailing "Show less" stays interactive. YouTube does the same.
              expanded && 'cursor-default md:hover:bg-secondary',
            )}
          >
            <p className="font-medium">{stats}</p>

            {video.description ? (
              <p
                className={cn(
                  'mt-1 whitespace-pre-wrap break-words leading-relaxed',
                  !expanded && 'line-clamp-3',
                )}
              >
                {video.description}
              </p>
            ) : null}

            <span className="mt-1 inline-flex items-center gap-1 font-medium">
              {expanded ? 'Show less' : '…more'}
              <ChevronDown
                className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')}
                aria-hidden
              />
            </span>
          </button>
        </div>
      </div>

      <aside className="mt-4 min-w-0 md:mt-0">
        {/*
          The queue, when there is one. Above the channel list because it plays
          first — the order on screen is the order things will play in.
        */}
        {queue.length > 0 ? (
          <section className="mb-4 rounded-xl bg-secondary/60 p-3 md:mb-6">
            <div className="flex items-center justify-between gap-2 pb-2">
              <h2 className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <ListVideo className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">
                  Queue
                  <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">
                    {queue.length}
                  </span>
                </span>
              </h2>

              <button
                type="button"
                onClick={clearQueue}
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground active:bg-accent md:hover:text-foreground"
              >
                Clear
              </button>
            </div>

            <ol className="space-y-1">
              {queue.map((item, position) => (
                <li key={item.id} className="flex items-center gap-1">
                  <span
                    className="w-4 shrink-0 text-center text-xs text-muted-foreground tabular-nums"
                    aria-hidden
                  >
                    {position + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <VideoRow video={item} />
                  </div>

                  <button
                    type="button"
                    aria-label={`Remove ${item.title} from the queue`}
                    onClick={() => removeFromQueue(item.id)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground active:bg-accent md:hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ol>

            <p className="pt-2 text-xs text-muted-foreground">
              Plays in this order when each video ends, before anything below.
            </p>
          </section>
        ) : null}

        <div className="flex items-center justify-between gap-2 px-3 pb-2 md:px-0">
          <h2 className="min-w-0 truncate text-sm font-medium">
            More from{' '}
            <Link href={`/channel/${video.channelId}`} className="underline-offset-4 hover:underline">
              {channel?.title ?? video.channelTitle}
            </Link>
          </h2>

          {/*
            Governs only the fallback to this channel's next upload — a queued
            video plays regardless, because queueing it said so explicitly.
          */}
          <label
            title="Play this channel's next video when one ends. The queue always plays first."
            className="flex shrink-0 cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground"
          >
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
