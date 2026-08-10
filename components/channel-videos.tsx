'use client'

import * as React from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'

import { publishQuota } from '@/components/quota-meter'
import { Button } from '@/components/ui/button'
import { VideoCard } from '@/components/video-card'
import { VideoGridSkeleton } from '@/components/video-grid-skeleton'
import { cn } from '@/lib/utils'
import type { SearchResponse, VideoResult } from '@/lib/youtube'

type Tab = 'latest' | 'popular'

type ChannelVideosProps = {
  channelId: string
  /** Rendered on the server, so the first page costs no extra round trip. */
  initialItems: VideoResult[]
  initialPageToken: string | null
}

/**
 * The channel's video grid.
 *
 * The two tabs cost wildly different amounts, and the labels say so rather than
 * hiding it: Latest pages through the uploads playlist at 2 units a page, while
 * Popular has to run a real channel-scoped search — 100 units, and one of only
 * 100 searches a day. That's why Latest is the default and Popular is opt-in.
 */
export function ChannelVideos({ channelId, initialItems, initialPageToken }: ChannelVideosProps) {
  const [tab, setTab] = React.useState<Tab>('latest')
  const [items, setItems] = React.useState(initialItems)
  const [pageToken, setPageToken] = React.useState(initialPageToken)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const inFlight = React.useRef(false)

  const fetchPage = React.useCallback(
    async (nextTab: Tab, token: string | null, append: boolean) => {
      if (inFlight.current) return
      inFlight.current = true

      setLoading(true)
      setError(null)

      const url =
        nextTab === 'latest'
          ? `/api/channel?id=${channelId}${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`
          : `/api/search?channel=${channelId}&sort=viewCount${
              token ? `&pageToken=${encodeURIComponent(token)}` : ''
            }`

      try {
        const response = await fetch(url)
        const data = (await response.json()) as SearchResponse & { error?: string }

        publishQuota(data.quota)

        if (!response.ok) throw new Error(data.error || 'Could not load videos.')

        setItems((previous) => {
          if (!append) return data.items

          const seen = new Set(previous.map((item) => item.id))
          return [...previous, ...data.items.filter((item) => !seen.has(item.id))]
        })
        setPageToken(data.nextPageToken)
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Something went wrong.')
      } finally {
        inFlight.current = false
        setLoading(false)
      }
    },
    [channelId],
  )

  const switchTab = (next: Tab) => {
    if (next === tab) return

    setTab(next)

    // Going back to Latest costs nothing: the server already sent that page.
    if (next === 'latest') {
      setItems(initialItems)
      setPageToken(initialPageToken)
      setError(null)
      return
    }

    setItems([])
    void fetchPage(next, null, false)
  }

  return (
    <div>
      {/*
        Pinned under the app bar, the way a channel's tab strip is on YouTube, so
        switching tabs doesn't mean scrolling back up the whole grid.
      */}
      <div className="sticky top-header z-30 mb-3 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-0">
        <div className="no-scrollbar swipe-row flex gap-1 overflow-x-auto">
          <TabButton active={tab === 'latest'} onClick={() => switchTab('latest')}>
            Latest
          </TabButton>
          <TabButton active={tab === 'popular'} onClick={() => switchTab('popular')}>
            Popular
            <span className="ml-1.5 text-[11px] font-normal opacity-60">1 search</span>
          </TabButton>
        </div>
      </div>

      {error ? (
        <div className="mx-3 flex flex-col items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-6 py-10 text-center sm:mx-0">
          <AlertCircle className="h-7 w-7 text-destructive" aria-hidden />
          <p className="max-w-md text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => fetchPage(tab, null, false)}>
            Try again
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-6 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((video, index) => (
          <VideoCard key={video.id} video={video} priority={index < 2} />
        ))}

        {loading && items.length === 0 ? <VideoGridSkeleton count={8} /> : null}
      </div>

      {!error && !loading && items.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-muted-foreground">
          This channel has no long-form videos.
        </p>
      ) : null}

      {pageToken ? (
        <div className="flex justify-center px-3 pt-6 sm:px-0">
          <Button
            variant="outline"
            size="lg"
            onClick={() => fetchPage(tab, pageToken, true)}
            disabled={loading}
          >
            {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Load more
            <span className="text-xs opacity-60">{tab === 'latest' ? '2 units' : '+1 search'}</span>
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        // 48px tall with a 2px underline, matching YouTube's tab strip.
        '-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors',
        active
          ? 'border-foreground text-foreground'
          : 'border-transparent text-muted-foreground active:text-foreground md:hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
