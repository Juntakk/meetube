'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { CATEGORIES, costsSearch } from '@/lib/categories'
import { cn } from '@/lib/utils'

type CategoryChipsProps = {
  active: string | null
  onSelect: (categoryId: string | null) => void
  disabled?: boolean
}

/** How far one press of an arrow travels. Roughly three chips, as on YouTube. */
const NUDGE = 240

/**
 * YouTube's chip bar. Scrolls horizontally rather than wrapping, so it stays one
 * line tall on a phone however many categories there are.
 *
 * From `md` up it grows the pair of arrow buttons youtube.com puts at the ends of
 * this row, each appearing only when there is actually something to scroll to in
 * that direction, over a gradient that fades the chips out beneath them. A phone
 * gets neither: there you swipe, and an arrow would only cover a chip.
 */
export function CategoryChips({ active, onSelect, disabled }: CategoryChipsProps) {
  const trackRef = React.useRef<HTMLDivElement | null>(null)
  const [overflow, setOverflow] = React.useState({ left: false, right: false })

  const measure = React.useCallback(() => {
    const track = trackRef.current
    if (!track) return

    const { scrollLeft, scrollWidth, clientWidth } = track
    setOverflow({
      left: scrollLeft > 1,
      // A pixel of slack: sub-pixel widths otherwise leave the arrow up forever
      // at the very end of the track.
      right: scrollLeft + clientWidth < scrollWidth - 1,
    })
  }, [])

  React.useEffect(() => {
    const track = trackRef.current
    if (!track) return

    measure()

    // Resizing changes what fits, and so does a font finishing loading — both
    // arrive through the observer rather than needing a listener each.
    const observer = new ResizeObserver(measure)
    observer.observe(track)

    return () => observer.disconnect()
  }, [measure])

  const nudge = (direction: -1 | 1) => {
    trackRef.current?.scrollBy({ left: direction * NUDGE, behavior: 'smooth' })
  }

  return (
    <div className="relative min-w-0">
      <div
        ref={trackRef}
        onScroll={measure}
        // Bleeds left only: the first chip stays aligned with the content while
        // scrolled-off chips run to the screen edge. Bleeding right as well would
        // push the row underneath whatever sits beside it.
        className="no-scrollbar swipe-row -ml-3 flex gap-3 overflow-x-auto pb-0.5 pl-3 pr-1 sm:ml-0 sm:pl-0"
        role="group"
        aria-label="Categories"
      >
        <Chip label="All" selected={active === null} disabled={disabled} onClick={() => onSelect(null)} />

        {CATEGORIES.map((category) => (
          <Chip
            key={category.id}
            label={category.label}
            selected={active === category.id}
            disabled={disabled}
            paid={costsSearch(category)}
            onClick={() => onSelect(active === category.id ? null : category.id)}
          />
        ))}
      </div>

      {overflow.left ? <Arrow direction={-1} onClick={() => nudge(-1)} /> : null}
      {overflow.right ? <Arrow direction={1} onClick={() => nudge(1)} /> : null}
    </div>
  )
}

function Arrow({ direction, onClick }: { direction: -1 | 1; onClick: () => void }) {
  const isLeft = direction === -1

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-y-0 hidden items-center md:flex',
        // The gradient has to start *in* the background colour and end
        // transparent, or the chips appear to slide under a grey block.
        isLeft
          ? 'left-0 bg-gradient-to-r from-background via-background pr-8'
          : 'right-0 bg-gradient-to-l from-background via-background pl-8',
      )}
    >
      <button
        type="button"
        onClick={onClick}
        // Decorative: every chip stays reachable by scrolling or by Tab, so this
        // is a mouse convenience and shouldn't appear in the accessibility tree.
        aria-hidden
        tabIndex={-1}
        className="pointer-events-auto grid h-8 w-8 place-items-center rounded-full text-foreground md:hover:bg-accent"
      >
        {isLeft ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
      </button>
    </div>
  )
}

type ChipProps = {
  label: string
  selected: boolean
  disabled?: boolean
  /** Marks a chip that has to run a search rather than read the free chart. */
  paid?: boolean
  onClick: () => void
}

/**
 * 32px tall, borderless, grey fill, and the selected one inverts to solid — the
 * exact treatment youtube.com gives these. Notably *not* an outline: a bordered
 * chip row is the single most common tell of a YouTube clone.
 */
function Chip({ label, selected, disabled, paid = false, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      title={
        paid
          ? `${label} — runs a search (101 units, 1 of today's 100)`
          : `${label} — free to browse (1 unit)`
      }
      className={cn(
        'inline-flex h-8 shrink-0 select-none items-center gap-1 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
        selected
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-foreground active:bg-accent md:hover:bg-accent',
      )}
    >
      {label}
      {/*
        A single dot rather than a label: with six of ten chips costing a search,
        wording each one would double the row's width and drown the names. The
        title attribute carries the detail.
      */}
      {paid ? (
        <span
          aria-label="costs one search"
          className={cn(
            'h-1 w-1 shrink-0 rounded-full',
            selected ? 'bg-primary-foreground/60' : 'bg-amber-500',
          )}
        />
      ) : null}
    </button>
  )
}
