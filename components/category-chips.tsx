'use client'

import { CATEGORIES, costsSearch } from '@/lib/categories'
import { cn } from '@/lib/utils'

type CategoryChipsProps = {
  active: string | null
  onSelect: (categoryId: string | null) => void
  disabled?: boolean
}

/**
 * YouTube's chip bar. Scrolls horizontally rather than wrapping, so it stays one
 * line tall on a phone however many categories there are.
 */
export function CategoryChips({ active, onSelect, disabled }: CategoryChipsProps) {
  return (
    <div
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
