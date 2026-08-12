'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  Bookmark,
  Filter,
  SearchX,
  SlidersHorizontal,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

import { CategoryChips } from '@/components/category-chips'
import { ContinueWatching } from '@/components/continue-watching'
import { FeaturedFeed } from '@/components/featured-feed'
import { FilterBar } from '@/components/filter-bar'
import { publishQuota } from '@/components/quota-meter'
import { SiteHeader } from '@/components/site-header'
import { Button } from '@/components/ui/button'
import { VideoCard } from '@/components/video-card'
import { VideoGridSkeleton } from '@/components/video-grid-skeleton'
import { getCategory, isValidCategory } from '@/lib/categories'
import {
  countActiveFilters,
  DEFAULT_FILTERS,
  filtersToParams,
  parseFilters,
  type SearchFilters,
} from '@/lib/filters'
import { useFollowedChannels } from '@/lib/followed-channels'
import { useInterests } from '@/lib/interest-store'
import { usePrefs } from '@/lib/prefs'
import { rankForBrowse } from '@/lib/ranking'
import { useRecentSearches } from '@/lib/recent-searches'
import { readResults, writeResults } from '@/lib/result-cache'
import { buildProfile } from '@/lib/taste-profile'
import { cn } from '@/lib/utils'
import { useWatchHistory } from '@/lib/watch-history'
import { useWatchLater } from '@/lib/watch-later'
import type { SearchResponse, VideoResult } from '@/lib/youtube'

type Phase = 'idle' | 'searching' | 'loadingMore' | 'ready' | 'error'

/**
 * A page of 50 search results can be entirely Shorts. When that happens we keep
 * walking nextPageToken rather than showing a misleading "no results" state —
 * but only a few times, since each hop costs API quota.
 */
const MAX_CHAINED_PAGES = 3

/**
 * Feed columns at every width, and the grid gap that goes with them. On a phone
 * the gap is zero and the tiles are edge to edge: YouTube's feed is a single
 * stack of full-width thumbnails, not a grid of inset cards.
 */
const GRID = 'grid grid-cols-1 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-6 lg:grid-cols-3'

export function SearchView({ authConfigured = false }: { authConfigured?: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // The URL is the single source of truth: refresh, back/forward and shared
  // links all restore the same view without extra bookkeeping.
  const query = searchParams.get('q') ?? ''
  const showingSaved = searchParams.get('view') === 'saved'
  const rawCategory = searchParams.get('category')
  const category = isValidCategory(rawCategory) ? (rawCategory as string) : ''
  const activeCategory = getCategory(category)
  const filters = parseFilters(searchParams)

  const [filtersOpen, setFiltersOpen] = React.useState(false)
  const [items, setItems] = React.useState<VideoResult[]>([])
  const [nextPageToken, setNextPageToken] = React.useState<string | null>(null)
  const [filteredOut, setFilteredOut] = React.useState(0)
  const [phase, setPhase] = React.useState<Phase>('idle')
  const [error, setError] = React.useState<string | null>(null)

  const { saved } = useWatchLater()
  const { prefs } = usePrefs()

  // The same inputs the home feed ranks on, so a category orders itself the way
  // your feed does rather than by YouTube's generic view counts.
  const { history } = useWatchHistory()
  const { recent } = useRecentSearches()
  const { followed } = useFollowedChannels()
  const { interests } = useInterests()

  const abortRef = React.useRef<AbortController | null>(null)
  const inFlightRef = React.useRef(false)
  const sentinelRef = React.useRef<HTMLDivElement | null>(null)

  /*
   * Mirrors of the two accumulating pieces of state. "Load more" needs the
   * current values to build the object it caches, and reading them out of a
   * setState updater would run that write twice under StrictMode.
   */
  const itemsRef = React.useRef<VideoResult[]>([])
  const filteredOutRef = React.useRef(0)

  /*
   * Ranking inputs read at load time rather than closed over, so watching a video
   * mid-session doesn't rebuild `load` and retrigger the search it's in the middle
   * of. Same pattern as the featured feed.
   */
  const rankingRef = React.useRef({ history, saved, recent, followed, interests })
  rankingRef.current = { history, saved, recent, followed, interests }

  /** With nothing watched or followed there is no taste to order by — say so. */
  const profileIsEmpty = history.length === 0 && saved.length === 0 && followed.length === 0

  const load = React.useCallback(
    async (
      request: { q: string; category: string; filters: SearchFilters; key: string },
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
        itemsRef.current = []
        setNextPageToken(null)
        setFilteredOut(0)
        filteredOutRef.current = 0

        /*
         * Only on a fresh search, never on "load more" — appending must leave
         * you exactly where you were reading. Instant rather than smooth: from
         * far down the page the animation is a second of nothing happening.
         */
        window.scrollTo({ top: 0 })
      }

      try {
        const collected: VideoResult[] = []
        let token = pageToken
        let removed = 0

        for (let attempt = 0; attempt < MAX_CHAINED_PAGES; attempt += 1) {
          const params = new URLSearchParams()
          if (request.q) params.set('q', request.q)
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

        const previous = append ? itemsRef.current : []
        const seen = new Set(previous.map((item) => item.id))
        const incoming = collected.filter((item) => !seen.has(item.id))

        /*
         * Category browsing gets reordered by taste; a typed search does not.
         *
         * A chip carries no intent beyond the subject, so YouTube's chart order —
         * whatever happens to be most-viewed globally — is the least useful
         * ordering available, and your own channels and topics are a far better
         * one. But when you've typed words, relevance to those words *is* the
         * intent, and reordering it by taste would bury what you asked for.
         *
         * Ranked per page, not across the accumulated list, so "Load more" appends
         * rather than reshuffling rows you're already reading. Costs nothing: it's
         * a pure function over items already fetched.
         */
        const ordered =
          request.category && !request.q
            ? rankForBrowse(
                incoming,
                buildProfile({
                  history: rankingRef.current.history,
                  saved: rankingRef.current.saved,
                  searches: rankingRef.current.recent,
                  followed: rankingRef.current.followed.map((channel) => channel.id),
                }),
                rankingRef.current.interests,
              )
            : incoming

        const merged = [...previous, ...ordered]
        const totalFilteredOut = (append ? filteredOutRef.current : 0) + removed

        itemsRef.current = merged
        filteredOutRef.current = totalFilteredOut

        setItems(merged)
        setFilteredOut(totalFilteredOut)
        setNextPageToken(token)
        setPhase('ready')

        // Cached with the page token, so coming back can still "Load more".
        writeResults(request.key, {
          items: merged,
          nextPageToken: token,
          filteredOut: totalFilteredOut,
        })
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

  /** Identifies the search itself — everything except which page of it. */
  const requestKey = React.useMemo(() => {
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (category) params.set('category', category)
    filtersToParams({ sort, uploaded, length }, params)
    return params.toString()
  }, [query, category, sort, uploaded, length])

  React.useEffect(() => {
    if (showingSaved) return

    // Nothing selected at all — the home page shows the featured feed instead.
    if (!query && !category) {
      setPhase('idle')
      setItems([])
      itemsRef.current = []
      setNextPageToken(null)
      return
    }

    /*
     * Restore rather than refetch. This is what makes going to a video and
     * pressing back free — the same search would otherwise cost another 101
     * units and another of the day's 100 searches, for results you already had.
     */
    const cached = readResults(requestKey)

    if (cached) {
      itemsRef.current = cached.items
      filteredOutRef.current = cached.filteredOut

      setItems(cached.items)
      setFilteredOut(cached.filteredOut)
      setNextPageToken(cached.nextPageToken)
      setPhase('ready')
      return
    }

    void load({ q: query, category, filters: { sort, uploaded, length }, key: requestKey }, null)
  }, [query, category, sort, uploaded, length, showingSaved, requestKey, load])

  /** Writes the next view into the URL; everything else reacts to that. */
  const navigate = React.useCallback(
    (next: { q?: string; category?: string; filters?: SearchFilters; view?: 'saved' | null }) => {
      const params = new URLSearchParams()

      if (next.q) params.set('q', next.q)
      if (next.category) params.set('category', next.category)
      if (next.view === 'saved') params.set('view', 'saved')

      filtersToParams(next.filters ?? DEFAULT_FILTERS, params)

      const search = params.toString()
      router.push(search ? `/?${search}` : '/', { scroll: false })
    },
    [router],
  )

  const loadMore = React.useCallback(() => {
    if (inFlightRef.current || !nextPageToken || showingSaved) return
    void load(
      { q: query, category, filters: { sort, uploaded, length }, key: requestKey },
      nextPageToken,
    )
  }, [category, length, load, nextPageToken, query, requestKey, showingSaved, sort, uploaded])

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

  const activeFilterCount = countActiveFilters(filters)
  const isSearching = phase === 'searching'
  const showEmptyState = phase === 'ready' && items.length === 0
  const displayed = showingSaved ? saved : items

  return (
    <>
      <SiteHeader
        authConfigured={authConfigured}
        query={query}
        busy={isSearching}
        // Preserves whatever filters are already applied, which is what you
        // want when refining a search rather than starting a new one.
        onSearch={(next) => navigate({ q: next, filters })}
        savedHref={showingSaved ? null : '/?view=saved'}
      />

      <div className="mx-auto w-full max-w-6xl pb-8 sm:px-4">
        {/*
          Pinned directly beneath the app bar. `top-header` is the app bar's own
          height plus the notch inset, so this can't end up underneath it — which
          is what a hand-written offset did once the header wrapped to two rows.
        */}
        {!showingSaved ? (
          <div className="sticky top-header z-30 bg-background/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:mb-2 sm:px-0">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <CategoryChips
                  active={category || null}
                  disabled={isSearching}
                  onSelect={(next) =>
                    navigate({ q: query, category: next ?? undefined, filters })
                  }
                />
              </div>

              {/* Separator, so the button doesn't read as another chip. */}
              <div className="h-5 w-px shrink-0 bg-border" aria-hidden />

              <button
                type="button"
                aria-label="Search filters"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen(true)}
                // A chip itself, so it sits on the row's baseline rather than
                // beside it looking like a different kind of control.
                className={cn(
                  'inline-flex h-8 shrink-0 select-none items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors',
                  activeFilterCount > 0
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground active:bg-accent md:hover:bg-accent',
                )}
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden />
                {activeFilterCount > 0 ? (
                  <span className="tabular-nums">{activeFilterCount}</span>
                ) : null}
              </button>
            </div>

            {phase === 'ready' && items.length > 0 && filteredOut > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {filteredOut} Short{filteredOut === 1 ? '' : 's'} filtered out
              </p>
            ) : null}
          </div>
        ) : null}

        <FilterBar
          filters={filters}
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          disabled={isSearching}
          onChange={(next) => navigate({ q: query, category, filters: next })}
        />

        {/* Everything that isn't a full-bleed thumbnail gets the phone's gutter. */}
        <div className="px-3 sm:px-0">
          {/*
            Says that the order isn't YouTube's. "Trending in X" was a plain lie
            once these results started being reranked against your own history.
          */}
          {!showingSaved && activeCategory && !query ? (
            <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4" aria-hidden />
              <span>
                <span className="font-medium text-foreground">{activeCategory.label}</span>
                {profileIsEmpty
                  ? ' — trending'
                  : ', ordered by what you watch'}
              </span>
            </div>
          ) : null}

          {showingSaved ? (
            <div className="mb-3 flex items-center justify-between gap-3 pt-3">
              <h2 className="text-xl font-medium">Saved</h2>
              <Button variant="pill" size="pill" onClick={() => navigate({ q: query, filters })}>
                Back to search
              </Button>
            </div>
          ) : null}

          {showingSaved && saved.length === 0 ? (
            <EmptyState icon={Bookmark} title="Nothing saved yet">
              Tap ⋮ on any video and choose Save. Saved videos live on this device and cost no API
              quota to browse.
            </EmptyState>
          ) : null}

          {!showingSaved && phase === 'error' ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-6 py-12 text-center">
              <AlertCircle className="h-8 w-8 text-destructive" aria-hidden />
              <p className="max-w-md text-sm text-muted-foreground">{error}</p>
              <Button
                variant="outline"
                onClick={() =>
                  load(
                    { q: query, category, filters: { sort, uploaded, length }, key: requestKey },
                    null,
                  )
                }
              >
                Try again
              </Button>
            </div>
          ) : null}

          {!showingSaved && showEmptyState ? (
            <EmptyState icon={SearchX} title="No long-form videos found">
              {filteredOut > 0 ? (
                <>
                  <p>
                    Every one of the {filteredOut} results was a Short.{' '}
                    {sort === 'date'
                      ? 'Newest-first does this — recent uploads skew heavily to Shorts.'
                      : 'Try different words, or narrow the length.'}
                  </p>

                  {/* Both escape hatches re-query with a filter that excludes
                      Shorts server-side, so the next call returns a full page of
                      usable results instead of walking pages and discarding them. */}
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
                    {/* videoDuration only applies to a real search, not the trending chart. */}
                    {length === 'any' && query ? (
                      <Button
                        variant="outline"
                        onClick={() =>
                          navigate({ q: query, filters: { ...filters, length: 'medium' } })
                        }
                      >
                        <Filter />
                        Search 4–20 min videos only
                      </Button>
                    ) : null}

                    {sort === 'date' ? (
                      <Button
                        variant="outline"
                        onClick={() =>
                          navigate({
                            q: query,
                            category,
                            filters: { ...filters, sort: 'relevance' },
                          })
                        }
                      >
                        <SlidersHorizontal />
                        Sort by relevance instead
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : (
                'Nothing matched this search. Try different words or loosen the filters.'
              )}
            </EmptyState>
          ) : null}
        </div>

        {!showingSaved && phase === 'idle' ? (
          <>
            {/* Unfinished videos come before recommendations: finishing something
                you already chose beats being handed something new. */}
            <ContinueWatching />
            <FeaturedFeed gridClassName={GRID} />
          </>
        ) : null}

        {displayed.length > 0 || (!showingSaved && isSearching) ? (
          <div className={GRID}>
            {displayed.map((video, index) => (
              <VideoCard key={video.id} video={video} priority={index < 2} />
            ))}

            {isSearching ? <VideoGridSkeleton count={9} /> : null}
            {phase === 'loadingMore' ? <VideoGridSkeleton count={3} /> : null}
          </div>
        ) : null}

        {/* Infinite-scroll trigger; the button is the no-JS-observer fallback. */}
        <div ref={sentinelRef} className="h-px w-full" aria-hidden />

        {!showingSaved && phase === 'ready' && nextPageToken && items.length > 0 ? (
          <div className="mt-6 flex justify-center px-3 sm:px-0">
            <Button variant="outline" size="lg" onClick={loadMore}>
              Load more
              <span className="text-xs opacity-60">+1 search</span>
            </Button>
          </div>
        ) : null}
      </div>
    </>
  )
}

function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <Icon className="h-10 w-10 text-muted-foreground" aria-hidden />
      <p className="text-base font-medium">{title}</p>
      <div className="max-w-sm text-sm text-muted-foreground">{children}</div>
    </div>
  )
}
