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

/**
 * How many previously-shown video ids to remember. A few feeds' worth: remember
 * everything and eventually every candidate is a repeat, so the demotion in
 * buildFeed stops meaning anything.
 */
const SHOWN_MEMORY = 120

/** Only the two fields the card renders; the score breakdown isn't worth storing. */
type FeedEntry = { video: VideoResult; reason: string }

type CachedFeed = {
  intent: string
  fetchedAt: number
  entries: FeedEntry[]
  /** Ids this intent has already shown, so Refresh knows what would be a repeat. */
  shownIds?: string[]
  /** How far Refresh has advanced the interest-query rotation. */
  rotation?: number
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

  // A fixed clock, so the profile memo below doesn't rebuild on every render.
  const [now] = React.useState(() => Date.now())

  const profile = React.useMemo(
    () => buildProfile({ history, saved, searches: recent, now }),
    [history, saved, recent, now],
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
   * Everything the fetch needs, read at fetch time rather than closed over, so a
   * shifting profile can't rebuild this callback and retrigger the effect below.
   */
  const inputsRef = React.useRef({ profile, interests, recent, youtubeLinked })
  inputsRef.current = { profile, interests, recent, youtubeLinked }

  /** Advances one step per Refresh, so each press asks different questions. */
  const rotationRef = React.useRef(0)

  /** Ids already put on screen under this intent. Demoted on refresh, not dropped. */
  const shownRef = React.useRef<ReadonlySet<string>>(new Set())

  const fetchFeed = React.useCallback(async (currentIntent: string, force = false) => {
    requestedRef.current = currentIntent

    if (!force) {
      const cached = readCache()
      if (
        cached?.entries &&
        cached.intent === currentIntent &&
        Date.now() - cached.fetchedAt < CACHE_TTL_MS
      ) {
        /*
         * Both carry forward, or the first Refresh after a reload would ask the
         * questions this session already asked and re-serve videos already seen.
         */
        rotationRef.current = cached.rotation ?? 0
        shownRef.current = new Set(cached.shownIds ?? cached.entries.map((entry) => entry.video.id))

        setFeed(cached.entries)
        setFetchedAt(cached.fetchedAt)
        setStatus('ready')
        return
      }
    }

    setStatus('loading')
    setError(null)

    const { profile: currentProfile, interests: currentInterests, recent: currentRecent, youtubeLinked: linked } =
      inputsRef.current

    /*
     * A live clock, unlike the profile's. Freshness and velocity should reflect
     * when the feed was actually built, and the rotation window has to be able
     * to cross midnight in a session left open.
     */
    const at = Date.now()
    const seeds = pickSeeds(currentProfile, currentRecent, currentInterests, at, linked, rotationRef.current)

    try {
      const response = await fetch('/api/featured', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seeds }),
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
      const entries = buildFeed(
        data.groups,
        currentProfile,
        currentInterests,
        FEED_SIZE,
        at,
        shownRef.current,
      ).map((entry: ScoredVideo) => ({ video: entry.video, reason: entry.reason }))

      // Newest ids last, so trimming to the tail forgets the oldest first.
      const shownIds = [
        ...new Set([...shownRef.current, ...entries.map((entry) => entry.video.id)]),
      ].slice(-SHOWN_MEMORY)

      shownRef.current = new Set(shownIds)

      setFeed(entries)
      setFetchedAt(at)
      setStatus('ready')
      writeCache({
        intent: currentIntent,
        fetchedAt: at,
        entries,
        shownIds,
        rotation: rotationRef.current,
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not build your feed.')
      setStatus('error')
    }
  }, [])

  React.useEffect(() => {
    // Guarded on intent, so the profile shifting underneath doesn't refetch.
    if (requestedRef.current === intent) return
    void fetchFeed(intent)
  }, [fetchFeed, intent])

  /**
   * Refresh advances the rotation before fetching. Retry-after-error deliberately
   * doesn't: that should re-attempt what just failed, not move on from it.
   */
  const refresh = React.useCallback(() => {
    rotationRef.current += 1
    void fetchFeed(intent, true)
  }, [fetchFeed, intent])

  /** What a Refresh will cost. Query seeds are the only expensive kind. */
  const searchesPerRefresh = React.useMemo(
    () =>
      pickSeeds(profile, recent, interests, now, youtubeLinked).filter(
        (seed) => seed.type === 'query',
      ).length,
    [profile, recent, interests, now, youtubeLinked],
  )


  if (status === 'error') {
    return (
      <section className="mx-3 flex flex-col items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-6 py-10 text-center sm:mx-0">
        <AlertCircle className="h-7 w-7 text-destructive" aria-hidden />
        <p className="max-w-md text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => fetchFeed(intent, true)}>
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
            onClick={refresh}
            disabled={status === 'loading'}
            // Says what it costs, the way every other quota-spending control here
            // does — a refresh that re-searches is not a free button.
            title={[
              fetchedAt ? `Updated ${new Date(fetchedAt).toLocaleTimeString()}` : null,
              searchesPerRefresh > 0
                ? `Refresh costs ${searchesPerRefresh} search${searchesPerRefresh === 1 ? '' : 'es'}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
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
