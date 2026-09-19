'use client'

import * as React from 'react'
import { AlertCircle, Clock, RefreshCw, Shuffle, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { VideoCard } from '@/components/video-card'
import { VideoGridSkeleton } from '@/components/video-grid-skeleton'
import { publishQuota } from '@/components/quota-meter'
import { FEED_CHANNELS, UPLOADS_PER_CHANNEL, shuffle } from '@/lib/channel-feed'
import { useFollowedChannels } from '@/lib/followed-channels'
import { usePrefs } from '@/lib/prefs'
import type { VideoResult } from '@/lib/youtube'

const CACHE_KEY = 'meetube:channel-feed'
/*
 * Short TTL, unlike the old recommendation feed's 6 hours. A refresh here costs
 * well under 100 units against a 10,000/day budget — there's no reason to
 * serve a stale feed just to save quota that isn't scarce.
 */
const CACHE_TTL_MS = 60 * 60 * 1000

/**
 * Mirrors the cost /api/feed actually spends (see app/api/feed/route.ts), so
 * the refresh button can state its price before the first fetch even lands —
 * duplicated rather than shared because it's three integers, not logic worth
 * a module for.
 */
function estimateUnits(channelCount: number): number {
  return (
    Math.ceil(channelCount / 50) + channelCount + Math.ceil((channelCount * UPLOADS_PER_CHANNEL) / 50)
  )
}

/** How many cards show before "Show more" — free, since the fetch already has all of it. */
const INITIAL_SHOWN = 24

type CachedFeed = {
  /**
   * Joined channel ids: FEED_CHANNELS plus whatever's followed. Appending a
   * channel to either list changes this, which invalidates the cache.
   */
  intent: string
  fetchedAt: number
  /** Newest first, as /api/feed returns it. Shuffling happens client-side, on demand. */
  items: VideoResult[]
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

const FEED_IDS = new Set(FEED_CHANNELS.map((channel) => channel.id))

type ChannelFeedProps = {
  /** Shared with the results grid, so the two feeds line up column for column. */
  gridClassName: string
}

/** What the pull-to-refresh gesture in search-view.tsx reaches for. */
export type ChannelFeedHandle = {
  refresh: () => void
}

/**
 * The home feed: latest uploads from a fixed list of channels, plus whatever
 * you've followed from a channel page.
 *
 * Deliberately no personalization beyond that one explicit choice — no watch
 * history, no ranking, no topic picker. What's on screen is exactly what
 * /api/feed returned, either shuffled or in the newest-first order the API
 * itself returns — a preference, not a fetch — until Refresh asks again.
 */
export const ChannelFeed = React.forwardRef<ChannelFeedHandle, ChannelFeedProps>(function ChannelFeed(
  { gridClassName },
  ref,
) {
  const [items, setItems] = React.useState<VideoResult[]>([])
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = React.useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = React.useState<number | null>(null)
  const [shown, setShown] = React.useState(INITIAL_SHOWN)
  const { prefs, set: setPrefs } = usePrefs()
  const { followed } = useFollowedChannels()

  /*
   * Followed channels not already in FEED_CHANNELS, sorted rather than kept in
   * follow order — a toggle reordering the list (newest follow first) must not
   * look like a different intent and retrigger a fetch of the exact same set.
   */
  const extraIds = React.useMemo(
    () =>
      [...new Set(followed.map((channel) => channel.id))]
        .filter((id) => id && !FEED_IDS.has(id))
        .sort(),
    [followed],
  )

  const intent = React.useMemo(
    () => [...FEED_CHANNELS.map((channel) => channel.id), ...extraIds].join(','),
    [extraIds],
  )

  const requestedRef = React.useRef<string | null>(null)

  /*
   * Shuffled once per fetch, not per render or per toggle — so switching to
   * "Newest" and back to "Shuffled" restores the same order you had, rather
   * than reshuffling every time the button is pressed. A new fetch (Refresh,
   * or a changed channel list) is what earns a new shuffle.
   */
  const shuffled = React.useMemo(() => shuffle(items), [items])
  const displayed = prefs.feedSort === 'newest' ? items : shuffled

  /** Read at fetch time rather than closed over, so following a channel mid-fetch can't retrigger it. */
  const extraIdsRef = React.useRef(extraIds)
  extraIdsRef.current = extraIds

  const fetchFeed = React.useCallback(async (currentIntent: string, force = false) => {
    if (!force) {
      const cached = readCache()
      if (
        cached &&
        cached.intent === currentIntent &&
        Date.now() - cached.fetchedAt < CACHE_TTL_MS
      ) {
        setItems(cached.items)
        setFetchedAt(cached.fetchedAt)
        setStatus('ready')
        return
      }
    }

    setStatus('loading')
    setError(null)
    setShown(INITIAL_SHOWN)

    try {
      const params = new URLSearchParams()
      if (extraIdsRef.current.length > 0) params.set('extra', extraIdsRef.current.join(','))

      const response = await fetch(`/api/feed?${params}`)

      const data = (await response.json()) as {
        items?: VideoResult[]
        quota?: Parameters<typeof publishQuota>[0]
        error?: string
      }

      publishQuota(data.quota)

      if (!response.ok || !data.items) {
        throw new Error(data.error || 'Could not load your feed.')
      }

      const at = Date.now()
      setItems(data.items)
      setFetchedAt(at)
      setStatus('ready')
      writeCache({ intent: currentIntent, fetchedAt: at, items: data.items })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load your feed.')
      setStatus('error')
    }
  }, [])

  React.useEffect(() => {
    // Guarded on intent, so following/unfollowing a channel refetches, but a
    // re-render for an unrelated reason doesn't.
    if (requestedRef.current === intent) return
    requestedRef.current = intent
    void fetchFeed(intent)
  }, [fetchFeed, intent])

  const refresh = React.useCallback(() => {
    void fetchFeed(intent, true)
  }, [fetchFeed, intent])

  // The imperative escape hatch pull-to-refresh needs: that gesture lives
  // above this component, at the page level, since it has to work whether
  // your finger lands on ContinueWatching or the feed itself.
  React.useImperativeHandle(ref, () => ({ refresh }), [refresh])

  const toggleSort = React.useCallback(() => {
    setPrefs({ feedSort: prefs.feedSort === 'newest' ? 'shuffled' : 'newest' })
    // A different order reads as a different feed, so start back at the top of it.
    setShown(INITIAL_SHOWN)
  }, [prefs.feedSort, setPrefs])

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

  const visible = displayed.slice(0, shown)

  return (
    <section>
      <div className="flex items-center justify-between gap-2 px-3 pb-2 sm:px-0">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <h2 className="truncate text-base font-medium">Latest from your channels</h2>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            aria-label={prefs.feedSort === 'newest' ? 'Showing newest first' : 'Shuffled'}
            aria-pressed={prefs.feedSort === 'newest'}
            onClick={toggleSort}
            title={
              prefs.feedSort === 'newest'
                ? 'Newest first — tap to shuffle'
                : 'Shuffled — tap for newest first'
            }
          >
            {prefs.feedSort === 'newest' ? <Clock /> : <Shuffle />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            aria-label="Refresh feed"
            onClick={refresh}
            disabled={status === 'loading'}
            title={[
              fetchedAt ? `Updated ${new Date(fetchedAt).toLocaleTimeString()}` : null,
              // No search.list calls here — the whole feed is uploads playlists,
              // so it costs nothing against the daily search limit.
              `Refresh costs ~${estimateUnits(FEED_CHANNELS.length + extraIds.length)} units, 0 searches`,
            ]
              .filter(Boolean)
              .join(' · ')}
          >
            <RefreshCw className={status === 'loading' ? 'animate-spin' : undefined} />
          </Button>
        </div>
      </div>

      <div className={gridClassName}>
        {status === 'loading' && items.length === 0 ? (
          <VideoGridSkeleton count={9} />
        ) : (
          visible.map((video, index) => (
            <VideoCard key={video.id} video={video} priority={index < 2} />
          ))
        )}
      </div>

      {status === 'ready' && items.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing found from these channels right now. Try refreshing later.
        </p>
      ) : null}

      {status === 'ready' && shown < displayed.length ? (
        <div className="mt-6 flex justify-center px-3 sm:px-0">
          <Button variant="outline" size="lg" onClick={() => setShown((count) => count + INITIAL_SHOWN)}>
            Show more
          </Button>
        </div>
      ) : null}
    </section>
  )
})
