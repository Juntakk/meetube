'use client'

import * as React from 'react'
import { AlertCircle, Clock, RefreshCw, Shuffle, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { VideoCard } from '@/components/video-card'
import { VideoGridSkeleton } from '@/components/video-grid-skeleton'
import { publishQuota } from '@/components/quota-meter'
import { FEED_CHANNELS, shuffle } from '@/lib/channel-feed'
import { usePrefs } from '@/lib/prefs'
import type { VideoResult } from '@/lib/youtube'

const CACHE_KEY = 'meetube:channel-feed'
/*
 * Short TTL, unlike the old recommendation feed's 6 hours. A refresh here costs
 * ~21 units against a 10,000/day budget — there's no reason to serve a stale
 * feed just to save quota that isn't scarce.
 */
const CACHE_TTL_MS = 60 * 60 * 1000

/** How many cards show before "Show more" — free, since the fetch already has all of it. */
const INITIAL_SHOWN = 24

type CachedFeed = {
  /** Joined channel ids. Appending a channel changes this, which invalidates the cache. */
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

const INTENT = FEED_CHANNELS.map((channel) => channel.id).join(',')

type ChannelFeedProps = {
  /** Shared with the results grid, so the two feeds line up column for column. */
  gridClassName: string
}

/**
 * The home feed: latest uploads from a fixed list of channels.
 *
 * Deliberately no personalization — no watch history, no ranking, no topic
 * picker. What's on screen is exactly what /api/feed returned, either shuffled
 * or in the newest-first order the API itself returns — a preference, not a
 * fetch — until Refresh asks again.
 */
export function ChannelFeed({ gridClassName }: ChannelFeedProps) {
  const [items, setItems] = React.useState<VideoResult[]>([])
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = React.useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = React.useState<number | null>(null)
  const [shown, setShown] = React.useState(INITIAL_SHOWN)
  const { prefs, set: setPrefs } = usePrefs()

  const requestedRef = React.useRef(false)

  /*
   * Shuffled once per fetch, not per render or per toggle — so switching to
   * "Newest" and back to "Shuffled" restores the same order you had, rather
   * than reshuffling every time the button is pressed. A new fetch (Refresh,
   * or a changed channel list) is what earns a new shuffle.
   */
  const shuffled = React.useMemo(() => shuffle(items), [items])
  const displayed = prefs.feedSort === 'newest' ? items : shuffled

  const fetchFeed = React.useCallback(async (force = false) => {
    if (!force) {
      const cached = readCache()
      if (cached && cached.intent === INTENT && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
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
      const response = await fetch('/api/feed')

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
      writeCache({ intent: INTENT, fetchedAt: at, items: data.items })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load your feed.')
      setStatus('error')
    }
  }, [])

  React.useEffect(() => {
    if (requestedRef.current) return
    requestedRef.current = true
    void fetchFeed()
  }, [fetchFeed])

  const refresh = React.useCallback(() => {
    void fetchFeed(true)
  }, [fetchFeed])

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
        <Button variant="outline" onClick={() => fetchFeed(true)}>
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
              'Refresh costs ~21 units, 0 searches',
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
}
