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
/** Candidates are re-ranked on every render; only the fetch is cached. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const FEED_SIZE = 24

type CachedFeed = {
  signature: string
  fetchedAt: number
  groups: SeedGroup[]
  unitsSpent: number
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
  onSelect: (video: VideoResult) => void
  onChannelSelect: (video: VideoResult) => void
}

export function FeaturedFeed({ onSelect, onChannelSelect }: FeaturedFeedProps) {
  const { history } = useWatchHistory()
  const { saved, savedIds, toggle: toggleSaved } = useWatchLater()
  const { recent } = useRecentSearches()
  const { data: session } = useSession()
  const youtubeLinked = Boolean(session) && !(session as { error?: string } | null)?.error
  const { interests, enabledIds, toggle: toggleInterest, reset: resetInterests, allOn } = useInterests()
  const [topicsOpen, setTopicsOpen] = React.useState(false)

  const [groups, setGroups] = React.useState<SeedGroup[] | null>(null)
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
  const signature = React.useMemo(
    () => `${youtubeLinked ? 'yt' : 'anon'}|${seeds.map((seed) => `${seed.type}:${seed.value}`).join('|')}`,
    [seeds, youtubeLinked],
  )

  const fetchFeed = React.useCallback(
    async (currentSeeds: typeof seeds, currentSignature: string, force = false) => {
      requestedRef.current = currentSignature

      if (!force) {
        const cached = readCache()
        if (
          cached &&
          cached.signature === currentSignature &&
          Date.now() - cached.fetchedAt < CACHE_TTL_MS
        ) {
          setGroups(cached.groups)
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

        const stamp = Date.now()
        setGroups(data.groups)
        setFetchedAt(stamp)
        setStatus('ready')
        writeCache({
          signature: currentSignature,
          fetchedAt: stamp,
          groups: data.groups,
          unitsSpent: data.unitsSpent ?? 0,
        })
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not build your feed.')
        setStatus('error')
      }
    },
    [],
  )

  React.useEffect(() => {
    if (!signature || requestedRef.current === signature) return
    void fetchFeed(seeds, signature)
  }, [fetchFeed, seeds, signature])

  /*
   * Ranking runs locally over cached candidates, so watching or saving something
   * reorders the feed immediately — no refetch, no quota.
   */
  const feed: ScoredVideo[] = React.useMemo(
    () => (groups ? buildFeed(groups, profile, interests, FEED_SIZE, now) : []),
    [groups, profile, interests, now],
  )


  if (status === 'error') {
    return (
      <section className="flex flex-col items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-6 py-10 text-center">
        <AlertCircle className="h-7 w-7 text-destructive" aria-hidden />
        <p className="max-w-md text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => fetchFeed(seeds, signature, true)}>
          Try again
        </Button>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden />
          <h2 className="text-sm font-medium">
            {youtubeLinked ? 'From your subscriptions' : 'Picked for you'}
          </h2>
        </div>

        <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-muted-foreground"
          aria-expanded={topicsOpen}
          onClick={() => setTopicsOpen((open) => !open)}
        >
          <SlidersHorizontal />
          <span className="sr-only sm:not-sr-only">Topics</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-muted-foreground"
          onClick={() => fetchFeed(seeds, signature, true)}
          disabled={status === 'loading'}
          title={fetchedAt ? `Updated ${new Date(fetchedAt).toLocaleString()}` : undefined}
        >
          <RefreshCw className={status === 'loading' ? 'animate-spin' : undefined} />
          <span className="sr-only sm:not-sr-only">Refresh</span>
        </Button>
        </div>
      </div>

      {topicsOpen ? (
        <InterestPicker
          enabledIds={enabledIds}
          onToggle={toggleInterest}
          onReset={resetInterests}
          allOn={allOn}
        />
      ) : null}

      {interests.length === 0 ? (
        <p className="rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          No topics selected. Turn some on to get a feed.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {status === 'loading' && feed.length === 0 ? (
          <VideoGridSkeleton count={6} />
        ) : (
          feed.map((entry) => (
            <div key={entry.video.id} className="space-y-1.5">
              <VideoCard
                video={entry.video}
                onSelect={onSelect}
                onChannelSelect={onChannelSelect}
                onToggleSave={toggleSaved}
                isSaved={savedIds.has(entry.video.id)}
              />
              <p className="truncate px-1 text-xs text-muted-foreground" title={entry.reason}>
                {entry.reason}
              </p>
            </div>
          ))
        )}
      </div>

      {status === 'ready' && feed.length === 0 ? (
        <p className="rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          Nothing new to show — you&rsquo;ve already seen everything we found. Try refreshing later.
        </p>
      ) : null}
    </section>
  )
}
