'use client'

import { CATEGORIES } from '@/lib/categories'
import { cn } from '@/lib/utils'

type CategoryChipsProps = {
  active: string | null
  onSelect: (categoryId: string | null) => void
  disabled?: boolean
}

/**
 * YouTube-style chip row. Horizontally scrollable rather than wrapping, so it
 * stays one line tall on a phone no matter how many categories there are.
 */
export function CategoryChips({ active, onSelect, disabled }: CategoryChipsProps) {
  return (
    <div
      // Bleeds left only: the first chip stays aligned with the search bar while
      // scrolled-off chips run to the screen edge. Bleeding right as well would
      // push the row underneath whatever sits beside it.
      className="no-scrollbar -ml-4 flex gap-2 overflow-x-auto pb-0.5 pl-4 pr-1"
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

function Chip({ label, selected, disabled, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50',
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-foreground hover:bg-accent',
      )}
    >
      {label}
    </button>
  )
}
