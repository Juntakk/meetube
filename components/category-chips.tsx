'use client'

import { CATEGORIES } from '@/lib/categories'
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
  onClick: () => void
}

/**
 * 32px tall, borderless, grey fill, and the selected one inverts to solid — the
 * exact treatment youtube.com gives these. Notably *not* an outline: a bordered
 * chip row is the single most common tell of a YouTube clone.
 */
function Chip({ label, selected, disabled, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'h-8 shrink-0 select-none whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
        selected
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-foreground active:bg-accent md:hover:bg-accent',
      )}
    >
      {label}
    </button>
  )
}
