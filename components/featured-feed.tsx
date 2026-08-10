'use client'

import * as React from 'react'
import { useSession } from 'next-auth/react'
import { AlertCircle, RefreshCw, SlidersHorizontal, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { VideoCard } from '@/components/video-card'
import { VideoGridSkeleton } from '@/components/video-grid-skeleton'
import { InterestPicker } from '@/components/interest-picker'
import { publishQuota } from '@/components/quota-meter'
import { useInterests } from '@/lib/interest-store'
import { buildFeed, type ScoredVideo, type SeedGroup } from '@/lib/ranking'
import { useRecentSearches } from '@/lib/recent-searches'
import { buildProfile, pickSeeds } from '@/lib/taste-profile'
import { useWatchHistory } from '@/lib/watch-history'
import { useWatchLater } from '@/lib/watch-later'
import type { VideoResult } from '@/lib/youtube'

const CACHE_KEY = 'meetube:featured-cache'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const FEED_SIZE = 24

/** Only the two fields the card renders; the score breakdown isn't worth storing. */
type FeedEntry = { video: VideoResult; reason: string }

type CachedFeed = {
  intent: string
  fetchedAt: number
  entries: FeedEntry[]
}

function readCache(): CachedFeed | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as CachedFeed) : null
  } catch {
    return null
  }
}

function writeCache(value: CachedFeed) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(value))
  } catch {
    // Feed cache is a nice-to-have; losing it just means refetching.
  }
}

type FeaturedFeedProps = {
  /** Shared with the results grid, so the two feeds line up column for column. */
  gridClassName: string
}

export function FeaturedFeed({ gridClassName }: FeaturedFeedProps) {
  const { history } = useWatchHistory()
  const { saved } = useWatchLater()
  const { recent } = useRecentSearches()
  const { data: session } = useSession()
  const youtubeLinked = Boolean(session) && !(session as { error?: string } | null)?.error
  const { interests, enabledIds, toggle: toggleInterest, reset: resetInterests, allOn } = useInterests()
  const [topicsOpen, setTopicsOpen] = React.useState(false)

  const [feed, setFeed] = React.useState<FeedEntry[]>([])
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = React.useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = React.useState<number | null>(null)

  const requestedRef = React.useRef<string | null>(null)

  // A fixed clock so scores don't drift between renders within a session.
  const [now] = React.useState(() => Date.now())

  const profile = React.useMemo(
    () => buildProfile({ history, saved, searches: recent, now }),
    [history, saved, recent, now],
  )

  const seeds = React.useMemo(
    () => pickSeeds(profile, recent, interests, now, youtubeLinked),
    [profile, recent, interests, now, youtubeLinked],
  )

  /*
   * What the cache is keyed on — and deliberately NOT the seeds.
   *
   * Seeds are derived from the taste profile, so merely watching a video
   * changes them. Keying on that meant leaving the page and coming back missed
   * the cache and refetched the whole feed: up to five seeds at 101 units each.
   * Only things you chose on purpose belong here.
   */
  const intent = React.useMemo(
    () => `${youtubeLinked ? 'yt' : 'anon'}|${[...enabledIds].sort().join(',')}`,
    [enabledIds, youtubeLinked],
  )

  /*
   * Ranking inputs read at fetch time rather than closed over, so a changing
   * profile doesn't rebuild this callback and retrigger the effect below.
   */
  const rankingRef = React.useRef({ profile, interests, now })
  rankingRef.current = { profile, interests, now }

  const fetchFeed = React.useCallback(
    async (currentSeeds: typeof seeds, currentIntent: string, force = false) => {
      requestedRef.current = currentIntent

      if (!force) {
        const cached = readCache()
        if (
          cached?.entries &&
          cached.intent === currentIntent &&
          Date.now() - cached.fetchedAt < CACHE_TTL_MS
        ) {
          setFeed(cached.entries)
          setFetchedAt(cached.fetchedAt)
          setStatus('ready')
          return
        }
      }

      setStatus('loading')
      setError(null)

      try {
        const response = await fetch('/api/featured', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seeds: currentSeeds }),
        })

        const data = (await response.json()) as {
          groups?: SeedGroup[]
          unitsSpent?: number
          quota?: Parameters<typeof publishQuota>[0]
          error?: string
        }

        publishQuota(data.quota)

        if (!response.ok || !data.groups) {
          throw new Error(data.error || 'Could not build your feed.')
        }

        /*
         * Ranked once, here, and the result is what gets stored. Re-ranking on
         * every render used to reshuffle the grid the moment you watched
         * something — free in quota terms, but it meant the feed you came back
         * to was never the feed you left. Refresh re-ranks; nothing else does.
         */
        const ranking = rankingRef.current
        const entries = buildFeed(
          data.groups,
          ranking.profile,
          ranking.interests,
          FEED_SIZE,
          ranking.now,
        ).map((entry: ScoredVideo) => ({ video: entry.video, reason: entry.reason }))

        const stamp = Date.now()
        setFeed(entries)
        setFetchedAt(stamp)
        setStatus('ready')
        writeCache({ intent: currentIntent, fetchedAt: stamp, entries })
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not build your feed.')
        setStatus('error')
      }
    },
    [],
  )

  React.useEffect(() => {
    // Guarded on intent, so the seeds shifting underneath doesn't refetch.
    if (requestedRef.current === intent) return
    void fetchFeed(seeds, intent)
  }, [fetchFeed, seeds, intent])


  if (status === 'error') {
    return (
      <section className="mx-3 flex flex-col items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-6 py-10 text-center sm:mx-0">
        <AlertCircle className="h-7 w-7 text-destructive" aria-hidden />
        <p className="max-w-md text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => fetchFeed(seeds, intent, true)}>
          Try again
        </Button>
      </section>
    )
  }

  return (
    <section>
      {/*
        Sits in the phone's gutter rather than bleeding, because it's text — only
        thumbnails run to the screen edge.
      */}
      <div className="flex items-center justify-between gap-2 px-3 pb-2 sm:px-0">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <h2 className="truncate text-base font-medium">
            {youtubeLinked ? 'From your subscriptions' : 'Picked for you'}
          </h2>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            aria-label="Feed topics"
            aria-expanded={topicsOpen}
            onClick={() => setTopicsOpen((open) => !open)}
          >
            <SlidersHorizontal />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            aria-label="Refresh feed"
            onClick={() => fetchFeed(seeds, intent, true)}
            disabled={status === 'loading'}
            title={fetchedAt ? `Updated ${new Date(fetchedAt).toLocaleString()}` : undefined}
          >
            <RefreshCw className={status === 'loading' ? 'animate-spin' : undefined} />
          </Button>
        </div>
      </div>

      {topicsOpen ? (
        <div className="px-3 pb-3 sm:px-0">
          <InterestPicker
            enabledIds={enabledIds}
            onToggle={toggleInterest}
            onReset={resetInterests}
            allOn={allOn}
          />
        </div>
      ) : null}

      {interests.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          No topics selected. Turn some on to get a feed.
        </p>
      ) : null}

      <div className={gridClassName}>
        {status === 'loading' && feed.length === 0 ? (
          <VideoGridSkeleton count={6} />
        ) : (
          feed.map((entry, index) => (
            <VideoCard
              key={entry.video.id}
              video={entry.video}
              reason={entry.reason}
              priority={index < 2}
            />
          ))
        )}
      </div>

      {status === 'ready' && feed.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing new to show — you&rsquo;ve already seen everything we found. Try refreshing later.
        </p>
      ) : null}
    </section>
  )
}
