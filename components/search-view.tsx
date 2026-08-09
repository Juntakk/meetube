'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  Bookmark,
  Filter,
  Loader2,
  Search,
  SearchX,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react'

import { CategoryChips } from '@/components/category-chips'
import { FeaturedFeed } from '@/components/featured-feed'
import { FilterBar } from '@/components/filter-bar'
import { publishQuota, QuotaMeter } from '@/components/quota-meter'
import { SearchSuggestions } from '@/components/search-suggestions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { VideoCard } from '@/components/video-card'
import { VideoDialog } from '@/components/video-dialog'
import { VideoGridSkeleton } from '@/components/video-grid-skeleton'
import { getCategory, isValidCategory } from '@/lib/categories'
import {
  countActiveFilters,
  DEFAULT_FILTERS,
  filtersToParams,
  parseFilters,
  type SearchFilters,
} from '@/lib/filters'
import { usePrefs } from '@/lib/prefs'
import { useRecentSearches } from '@/lib/recent-searches'
import { recordWatch } from '@/lib/watch-history'
import { useWatchLater } from '@/lib/watch-later'
import { SHORTS_MAX_SECONDS, type SearchResponse, type VideoResult } from '@/lib/youtube'

type Phase = 'idle' | 'searching' | 'loadingMore' | 'ready' | 'error'

/**
 * A page of 50 search results can be entirely Shorts. When that happens we keep
 * walking nextPageToken rather than showing a misleading "no results" state —
 * but only a few times, since each hop costs API quota.
 */
const MAX_CHAINED_PAGES = 3

/** "3 minutes" / "90 seconds" — derived so the copy can't drift from the filter. */
const CUTOFF_MINUTES = SHORTS_MAX_SECONDS / 60
const CUTOFF_LABEL = Number.isInteger(CUTOFF_MINUTES)
  ? `${CUTOFF_MINUTES} minute${CUTOFF_MINUTES === 1 ? '' : 's'}`
  : `${SHORTS_MAX_SECONDS} seconds`

export function SearchView() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // The URL is the single source of truth: refresh, back/forward and shared
  // links all restore the same view without extra bookkeeping.
  const query = searchParams.get('q') ?? ''
  const channelId = searchParams.get('channel') ?? ''
  const channelName = searchParams.get('channelName') ?? ''
  const showingSaved = searchParams.get('view') === 'saved'
  const rawCategory = searchParams.get('category')
  const category = isValidCategory(rawCategory) ? (rawCategory as string) : ''
  const activeCategory = getCategory(category)
  const filters = parseFilters(searchParams)

  const [input, setInput] = React.useState(query)
  const [suggestionsOpen, setSuggestionsOpen] = React.useState(false)
  const [filtersOpen, setFiltersOpen] = React.useState(false)
  const [items, setItems] = React.useState<VideoResult[]>([])
  const [nextPageToken, setNextPageToken] = React.useState<string | null>(null)
  const [filteredOut, setFilteredOut] = React.useState(0)
  const [phase, setPhase] = React.useState<Phase>('idle')
  const [error, setError] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<VideoResult | null>(null)

  const { recent, add: addRecent, remove: removeRecent, clear: clearRecent } = useRecentSearches()
  const { saved, savedIds, toggle: toggleSaved } = useWatchLater()
  const { prefs } = usePrefs()

  const abortRef = React.useRef<AbortController | null>(null)
  const inFlightRef = React.useRef(false)
  const sentinelRef = React.useRef<HTMLDivElement | null>(null)

  // Keep the text box in step when navigation changes the query (back button,
  // a recent-search chip, or leaving a channel view).
  React.useEffect(() => setInput(query), [query])

  const load = React.useCallback(
    async (
      request: { q: string; channel: string; category: string; filters: SearchFilters },
      pageToken: string | null,
    ) => {
      const append = pageToken !== null

      // Any earlier request is now stale — a new search replaces it outright.
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      inFlightRef.current = true

      setPhase(append ? 'loadingMore' : 'searching')
      setError(null)
      if (!append) {
        setItems([])
        setNextPageToken(null)
        setFilteredOut(0)
      }

      try {
        const collected: VideoResult[] = []
        let token = pageToken
        let removed = 0

        for (let attempt = 0; attempt < MAX_CHAINED_PAGES; attempt += 1) {
          const params = new URLSearchParams()
          if (request.q) params.set('q', request.q)
          if (request.channel) params.set('channel', request.channel)
          if (request.category) params.set('category', request.category)
          filtersToParams(request.filters, params)
          if (token) params.set('pageToken', token)

          const response = await fetch(`/api/search?${params}`, { signal: controller.signal })
          const data = (await response.json()) as SearchResponse & { error?: string }

          publishQuota(data.quota)

          if (!response.ok) {
            throw new Error(data.error || 'Search failed. Please try again.')
          }

          collected.push(...data.items)
          removed += data.filteredOut
          token = data.nextPageToken

          // Got something, or there is nothing left to walk — stop here.
          if (collected.length > 0 || !token) break
        }

        if (controller.signal.aborted) return

        setItems((previous) => {
          if (!append) return collected

          const seen = new Set(previous.map((item) => item.id))
          return [...previous, ...collected.filter((item) => !seen.has(item.id))]
        })
        setFilteredOut((previous) => (append ? previous + removed : removed))
        setNextPageToken(token)
        setPhase('ready')
      } catch (caught) {
        if (controller.signal.aborted || (caught as Error)?.name === 'AbortError') return

        setError(caught instanceof Error ? caught.message : 'Something went wrong.')
        setPhase('error')
      } finally {
        if (abortRef.current === controller) inFlightRef.current = false
      }
    },
    [],
  )

  // Run a search whenever the URL describes one. Filters are listed individually
  // so a new object identity from parseFilters can't retrigger this.
  const { sort, uploaded, length } = filters

  React.useEffect(() => {
    if (showingSaved) return

    // Nothing selected at all — the home page shows the featured feed instead.
    if (!query && !channelId && !category) {
      setPhase('idle')
      setItems([])
      setNextPageToken(null)
      return
    }

    void load({ q: query, channel: channelId, category, filters: { sort, uploaded, length } }, null)
  }, [query, channelId, category, sort, uploaded, length, showingSaved, load])

  /** Writes the next view into the URL; everything else reacts to that. */
  const navigate = React.useCallback(
    (next: {
      q?: string
      channel?: string
      channelName?: string
      category?: string
      filters?: SearchFilters
      view?: 'saved' | null
    }) => {
      const params = new URLSearchParams()

      const nextQuery = next.q ?? ''
      const nextChannel = next.channel ?? ''
      const nextCategory = next.category ?? ''

      if (nextQuery) params.set('q', nextQuery)
      if (nextChannel) params.set('channel', nextChannel)
      if (nextChannel && next.channelName) params.set('channelName', next.channelName)
      // A channel view is already narrow; a category on top of it does nothing.
      if (nextCategory && !nextChannel) params.set('category', nextCategory)
      if (next.view === 'saved') params.set('view', 'saved')

      filtersToParams(next.filters ?? DEFAULT_FILTERS, params)

      const search = params.toString()
      router.push(search ? `/?${search}` : '/', { scroll: false })
    },
    [router],
  )

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return

    addRecent(trimmed)
    // A fresh search leaves any channel view and keeps the current filters.
    navigate({ q: trimmed, filters })
  }

  const loadMore = React.useCallback(() => {
    if (inFlightRef.current || !nextPageToken || showingSaved) return
    void load({ q: query, channel: channelId, category, filters: { sort, uploaded, length } }, nextPageToken)
  }, [category, channelId, length, load, nextPageToken, query, showingSaved, sort, uploaded])

  // Infinite scroll: fetch the next page as the sentinel comes into view.
  React.useEffect(() => {
    const sentinel = sentinelRef.current
    // Off by default: each auto-triggered page costs another 101 units.
    if (!prefs.autoLoad) return
    if (!sentinel || !nextPageToken || phase !== 'ready' || showingSaved) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { rootMargin: '400px' },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadMore, nextPageToken, phase, prefs.autoLoad, showingSaved])

  // Cancel any in-flight request if the view goes away mid-search.
  React.useEffect(() => () => abortRef.current?.abort(), [])

  /** Opening a video is the strongest taste signal, so it feeds the ranker. */
  const handleSelect = React.useCallback((video: VideoResult) => {
    recordWatch(video)
    setSelected(video)
  }, [])

  const handleChannelSelect = React.useCallback(
    (video: VideoResult) =>
      navigate({
        channel: video.channelId,
        channelName: video.channelTitle,
        filters: DEFAULT_FILTERS,
      }),
    [navigate],
  )

  // Recent searches appear only while the box is focused and still empty —
  // once you start typing, they'd just be in the way.
  const showSuggestions = suggestionsOpen && input.trim() === '' && recent.length > 0
  const activeFilterCount = countActiveFilters(filters)

  const isSearching = phase === 'searching'
  const showEmptyState = phase === 'ready' && items.length === 0

  const displayed = showingSaved ? saved : items

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:pt-10">
      <header className="mb-2 flex items-start justify-between">
        <div className="space-y-1">
          {/* Clears every search param, so this is the "start over" affordance. */}
          <Link
            href="/"
            aria-label="MeeTube home"
            className="inline-flex items-center gap-2.5 rounded-md transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Image
              src="/icon-180.png"
              alt=""
              width={48}
              height={48}
              priority
              className="rounded-lg"
            />
            <h1 className="text-3xl font-semibold tracking-tight">MeeTube</h1>
          </Link>
        </div>

        <div className="flex items-center gap-3">
        <QuotaMeter />

        <Button
          variant={showingSaved ? 'default' : 'outline'}
          size="sm"
          onClick={() =>
            navigate(
              showingSaved
                ? { q: query, channel: channelId, channelName, filters }
                : { q: query, channel: channelId, channelName, filters, view: 'saved' },
            )
          }
        >
          <Bookmark />
          <span className="hidden sm:inline">Saved</span>
          {saved.length > 0 ? <span className="tabular-nums">{saved.length}</span> : null}
        </Button>
        </div>
      </header>

      {!showingSaved ? (
        <div className="sticky top-0 z-20 -mx-4 mb-6 space-y-3 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75">
          <form onSubmit={handleSubmit} className="relative flex gap-2">
            <div className="relative flex-1">
              <Input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onFocus={() => setSuggestionsOpen(true)}
                onBlur={() => setSuggestionsOpen(false)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setSuggestionsOpen(false)
                }}
                placeholder="Search videos…"
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                aria-label="Search YouTube"
                aria-expanded={showSuggestions}
              />

              {showSuggestions ? (
                <SearchSuggestions
                  recent={recent}
                  onSelect={(term) => {
                    setSuggestionsOpen(false)
                    addRecent(term)
                    navigate({ q: term, filters })
                  }}
                  onRemove={removeRecent}
                  onClear={clearRecent}
                />
              ) : null}
            </div>

            <Button type="submit" disabled={isSearching || !input.trim()} className="shrink-0">
              {isSearching ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />}
              <span className="sr-only sm:not-sr-only">Search</span>
            </Button>
          </form>

          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <CategoryChips
                active={category || null}
                disabled={isSearching}
                onSelect={(next) =>
                  navigate({
                    q: query,
                    channel: channelId,
                    channelName,
                    category: next ?? undefined,
                    filters,
                  })
                }
              />
            </div>

            {/* Separator so the button doesn't read as another chip. */}
            <div className="h-6 w-px shrink-0 bg-border" aria-hidden />

            <Button
              variant={activeFilterCount > 0 ? 'default' : 'ghost'}
              size="sm"
              className="h-9 shrink-0 px-2.5"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
              title="Sort and refine"
            >
              <SlidersHorizontal />
              {activeFilterCount > 0 ? (
                <span className="tabular-nums">{activeFilterCount}</span>
              ) : null}
              <span className="sr-only">Sort and refine</span>
            </Button>
          </div>

          {filtersOpen ? (
            <FilterBar
              filters={filters}
              disabled={isSearching}
              onChange={(next) =>
                navigate({ q: query, channel: channelId, channelName, category, filters: next })
              }
            />
          ) : null}

          {phase === 'ready' && items.length > 0 && filteredOut > 0 ? (
            <p className="text-xs text-muted-foreground">
              {filteredOut} Short{filteredOut === 1 ? '' : 's'} filtered out
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Category browsing banner */}
      {!showingSaved && activeCategory && !query && !channelId ? (
        <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <TrendingUp className="h-4 w-4" aria-hidden />
          <span>
            Trending in <span className="font-medium text-foreground">{activeCategory.label}</span>
          </span>
        </div>
      ) : null}

      {/* Channel browsing banner */}
      {!showingSaved && channelId ? (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
          <p className="min-w-0 text-sm">
            <span className="text-muted-foreground">Videos from </span>
            <span className="font-medium">{channelName || 'this channel'}</span>
          </p>
          <Button variant="ghost" size="sm" onClick={() => navigate({ q: query, filters })}>
            <ArrowLeft />
            Back
          </Button>
        </div>
      ) : null}

      {/* Recent searches now live in the focus dropdown above the results. */}

      {/* Saved view */}
      {showingSaved && saved.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
          <Bookmark className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">Nothing saved yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Tap the bookmark on any video to keep it here. Saved videos live on this device and cost
            no API quota to browse.
          </p>
        </div>
      ) : null}

      {!showingSaved && phase === 'error' ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-6 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" aria-hidden />
          <p className="max-w-md text-sm text-muted-foreground">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              load({ q: query, channel: channelId, category, filters: { sort, uploaded, length } }, null)
            }
          >
            Try again
          </Button>
        </div>
      ) : null}

      {!showingSaved && showEmptyState ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
          <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">No long-form videos found</p>

          {filteredOut > 0 ? (
            <>
              <p className="max-w-md text-sm text-muted-foreground">
                Every one of the {filteredOut} results was a Short. Some searches — especially
                sorted by newest — are almost entirely Shorts.
              </p>
              {/*
                The length filter excludes them server-side, so the next call
                returns a full page of usable results instead of walking pages
                and discarding them.
              */}
              {/* videoDuration only applies to a real search, not the trending chart. */}
              {length === 'any' && query ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    navigate({
                      q: query,
                      channel: channelId,
                      channelName,
                      filters: { ...filters, length: 'medium' },
                    })
                  }
                >
                  <Filter />
                  Search 4–20 min videos only
                </Button>
              ) : null}
            </>
          ) : (
            <p className="max-w-sm text-sm text-muted-foreground">
              Nothing matched this search. Try different words or loosen the filters.
            </p>
          )}
        </div>
      ) : null}

      {!showingSaved && phase === 'idle' ? (
        <div className="space-y-6">
          <FeaturedFeed onSelect={handleSelect} onChannelSelect={handleChannelSelect} />
        </div>
      ) : null}

      {displayed.length > 0 || (!showingSaved && isSearching) ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayed.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              onSelect={handleSelect}
              onToggleSave={toggleSaved}
              isSaved={savedIds.has(video.id)}
              onChannelSelect={handleChannelSelect}
            />
          ))}

          {isSearching ? <VideoGridSkeleton count={9} /> : null}
          {phase === 'loadingMore' ? <VideoGridSkeleton count={3} /> : null}
        </div>
      ) : null}

      {/* Infinite-scroll trigger; the button is the no-JS-observer fallback. */}
      <div ref={sentinelRef} className="h-px w-full" aria-hidden />

      {!showingSaved && phase === 'ready' && nextPageToken && items.length > 0 ? (
        <div className="mt-8 flex justify-center">
          <Button variant="outline" onClick={loadMore}>
            Load more
            <span className="text-xs opacity-60">+1 search</span>
          </Button>
        </div>
      ) : null}

      <VideoDialog video={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  )
}
