'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bookmark, History, Search } from 'lucide-react'

import { AuthButton } from '@/components/auth-button'
import { QuotaMeter } from '@/components/quota-meter'
import { SearchBox } from '@/components/search-box'
import { openSearchOverlay } from '@/components/search-overlay'
import { Button } from '@/components/ui/button'
import { VideoMenu } from '@/components/video-menu'
import { useWatchLater } from '@/lib/watch-later'

type SiteHeaderProps = {
  authConfigured?: boolean
  /** The committed query, so the box still reads it after navigating. */
  query?: string
  /**
   * Overridden by the results page, which has filters and a category to carry
   * across. Everywhere else a search simply means "go to the results page".
   */
  onSearch?: (query: string) => void
  busy?: boolean
  /** The results page renders its own Saved toggle, which knows it's active. */
  savedHref?: string | null
}

/**
 * YouTube's app bar, at both widths it has one.
 *
 * Phone: a 56px bar of logo and icon buttons only. The magnifier opens a
 * full-screen search screen rather than growing the bar, which is what stops the
 * header from wrapping to two rows and shoving the feed down the page.
 *
 * Desktop (`md` and up): logo left, the search pill centred, actions right.
 *
 * Being the same component everywhere is the point — a header that changes
 * between the results page and the watch page is the first thing that gives away
 * an app as not-quite-YouTube.
 */
export function SiteHeader({
  authConfigured = false,
  query = '',
  onSearch,
  busy = false,
  savedHref = '/?view=saved',
}: SiteHeaderProps) {
  const router = useRouter()
  const { saved } = useWatchLater()

  const handleSearch = React.useCallback(
    (next: string) => {
      if (onSearch) {
        onSearch(next)
        return
      }

      router.push(`/?q=${encodeURIComponent(next)}`)
    },
    [onSearch, router],
  )

  return (
    <>
      {/*
        Breaks out of the rail's inset.

        Pages render inside a wrapper padded by `--rail-w` (see app/layout.tsx), so
        without this the bar starts a rail's width in — the logo sitting *beside*
        the sidebar with dead space above it. YouTube's bar spans the full width and
        the rail begins underneath it, which is what these two classes restore.
      */}
      <header className="sticky top-0 z-40 bg-background pt-safe-t lg:-ml-[var(--rail-w)] lg:w-[calc(100%+var(--rail-w))]">
        {/*
          Edge to edge, deliberately uncentred. A max-width here would drift the
          logo inward on a wide window; on youtube.com it stays pinned left however
          wide the viewport gets. The search box does its own centring within the
          space that's left.
        */}
        <div className="flex h-app-bar w-full items-center gap-1 px-1 md:gap-4 md:px-4">
          {/* Clears every search param, so this is the "start over" affordance. */}
          <Link
            href="/"
            aria-label="MeeTube home"
            /*
             * The negative margins cancel most of the link's own padding, so the
             * mark sits in the bar's 16px gutter while the hover background keeps a
             * comfortable target around it. Trimming the padding instead would pull
             * the highlight tight to the letters.
             */
            className="-ml-0.5 flex shrink-0 items-center gap-1.5 rounded-lg px-1.5 py-1.5 md:-ml-1.5 md:hover:opacity-80"
          >
            <Image src="/icon-180.png" alt="" width={32} height={32} priority className="rounded-md" />
            {/* Tight tracking is what makes the YouTube wordmark read the way it does. */}
            <span className="text-xl font-semibold tracking-[-0.04em]">MeeTube</span>
          </Link>

          {/*
            A flex spacer on a phone, the centred search pill from md up. One
            element doing both keeps the logo and the actions pinned to the
            edges at every width.
          */}
          <div className="flex min-w-0 flex-1 justify-center md:px-4">
            <div className="hidden w-full max-w-[560px] md:block">
              <SearchBox query={query} onSearch={handleSearch} busy={busy} />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-0.5 md:gap-1.5">
            <QuotaMeter />

            {/* The phone's entry point to search; hidden once the pill fits. */}
            <button
              type="button"
              onClick={openSearchOverlay}
              aria-label="Search"
              className="grid h-11 w-11 place-items-center rounded-full text-foreground active:bg-accent md:hidden"
            >
              <Search className="h-6 w-6" strokeWidth={1.75} />
            </button>

            <AuthButton configured={authConfigured} />

            {/*
              Both only appear in the band between the dock and the rail. Below md
              the dock's You sheet carries them; from lg the rail does, and a third
              copy in the header would just be noise.
            */}
            <Button variant="pill" size="pill" asChild className="hidden md:inline-flex lg:hidden">
              <Link href="/history" title="Watch history">
                <History />
                <span className="sr-only">Watch history</span>
              </Link>
            </Button>

            {savedHref ? (
              <Button
                variant="pill"
                size="pill"
                asChild
                className="hidden md:inline-flex lg:hidden"
              >
                <Link href={savedHref}>
                  <Bookmark />
                  Saved
                  {saved.length > 0 ? <span className="tabular-nums">{saved.length}</span> : null}
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      {/* One overflow sheet for every card on the page. */}
      <VideoMenu />
    </>
  )
}
