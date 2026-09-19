'use client'

import * as React from 'react'
import { RefreshCw } from 'lucide-react'

import { cn } from '@/lib/utils'

/** How far down you have to drag before letting go actually refreshes. */
const PULL_THRESHOLD = 70
/** Where the indicator caps out, so a long drag doesn't keep growing forever. */
const MAX_PULL = 100
/** Rubber-band feel: your finger moves further than the indicator does. */
const RESISTANCE = 0.5

type PullToRefreshProps = {
  onRefresh: () => void
  children: React.ReactNode
}

/**
 * The mobile gesture, not a button: drag down from the very top of the page
 * and let go past the threshold to refresh, the way every native feed and
 * YouTube's own app do it.
 *
 * Listens on `window` rather than its own element, because "the top of the
 * page" is a `window.scrollY` fact, not something scoped to whatever DOM node
 * happens to wrap the feed — a drag that starts over ContinueWatching, above
 * the feed itself, has to count too. Touch-only: a mouse has no equivalent
 * gesture, and the refresh button already covers that case.
 */
export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pull, setPull] = React.useState(0)
  const [refreshing, setRefreshing] = React.useState(false)

  const startYRef = React.useRef<number | null>(null)
  const pullRef = React.useRef(0)
  const refreshingRef = React.useRef(false)

  React.useEffect(() => {
    const reset = () => {
      startYRef.current = null
      pullRef.current = 0
      setPull(0)
    }

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current || window.scrollY > 0) return
      startYRef.current = event.touches[0]?.clientY ?? null
    }

    const onTouchMove = (event: TouchEvent) => {
      if (startYRef.current === null || refreshingRef.current) return

      // The page scrolled out from under the gesture (or never was at the
      // top to begin with) — this isn't a pull-to-refresh drag any more.
      if (window.scrollY > 0) {
        reset()
        return
      }

      const currentY = event.touches[0]?.clientY ?? startYRef.current
      const delta = currentY - startYRef.current

      if (delta <= 0) {
        pullRef.current = 0
        setPull(0)
        return
      }

      // Only a downward pull at the top hijacks the touch — anything else
      // (an upward scroll) is left alone for the browser to handle normally.
      event.preventDefault()
      const next = Math.min(MAX_PULL, delta * RESISTANCE)
      pullRef.current = next
      setPull(next)
    }

    const onTouchEnd = () => {
      if (pullRef.current >= PULL_THRESHOLD) {
        refreshingRef.current = true
        setRefreshing(true)
        onRefresh()
        // Long enough to read as "something happened" even when the fetch
        // itself resolves near-instantly off a warm connection.
        setTimeout(() => {
          refreshingRef.current = false
          setRefreshing(false)
        }, 600)
      }
      reset()
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchcancel', onTouchEnd)

    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [onRefresh])

  const height = refreshing ? 48 : pull
  const progress = Math.min(1, pull / PULL_THRESHOLD)

  return (
    <div>
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-200 ease-out"
        style={{ height }}
        aria-hidden
      >
        <RefreshCw
          className={cn('h-5 w-5 text-muted-foreground', refreshing && 'animate-spin')}
          style={
            refreshing
              ? undefined
              : { transform: `rotate(${progress * 360}deg)`, opacity: progress }
          }
        />
      </div>
      {children}
    </div>
  )
}
