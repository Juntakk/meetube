'use client'

import * as React from 'react'
import { Check } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  countActiveFilters,
  DEFAULT_FILTERS,
  LENGTH_OPTIONS,
  SORT_OPTIONS,
  UPLOADED_OPTIONS,
  type SearchFilters,
} from '@/lib/filters'
import { cn } from '@/lib/utils'

type FilterBarProps = {
  filters: SearchFilters
  onChange: (filters: SearchFilters) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  disabled?: boolean
}

/**
 * The filter sheet: sections of tappable options, up from the bottom edge on a
 * phone, as a centred card on desktop. Replaces three dropdown selects, which on
 * a phone meant three separate popovers to open and 24px hit targets inside them.
 *
 * Choices are held as a draft and only applied on "Apply". Each application
 * re-runs the search — 101 units and one of the day's 100 — so letting every tap
 * fire one would make changing all three filters cost three searches.
 */
export function FilterBar({ filters, onChange, open, onOpenChange, disabled }: FilterBarProps) {
  const [draft, setDraft] = React.useState(filters)

  // Reopening starts from what's actually applied, not from an abandoned draft.
  React.useEffect(() => {
    if (open) setDraft(filters)
  }, [open, filters])

  const dirty =
    draft.sort !== filters.sort ||
    draft.uploaded !== filters.uploaded ||
    draft.length !== filters.length

  const activeCount = countActiveFilters(draft)

  const apply = () => {
    onOpenChange(false)
    if (dirty) onChange(draft)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Search filters</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
          <FilterGroup
            label="Sort by"
            value={draft.sort}
            options={SORT_OPTIONS}
            disabled={disabled}
            onChange={(sort) => setDraft({ ...draft, sort: sort as SearchFilters['sort'] })}
          />
          <FilterGroup
            label="Upload date"
            value={draft.uploaded}
            options={UPLOADED_OPTIONS}
            disabled={disabled}
            onChange={(uploaded) =>
              setDraft({ ...draft, uploaded: uploaded as SearchFilters['uploaded'] })
            }
          />
          <FilterGroup
            label="Length"
            value={draft.length}
            options={LENGTH_OPTIONS}
            disabled={disabled}
            onChange={(length) => setDraft({ ...draft, length: length as SearchFilters['length'] })}
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <Button
            variant="ghost"
            onClick={() => setDraft(DEFAULT_FILTERS)}
            disabled={disabled || activeCount === 0}
          >
            Reset
          </Button>

          <Button onClick={apply} disabled={disabled} className="min-w-24">
            {dirty ? 'Apply' : 'Done'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type FilterGroupProps = {
  label: string
  value: string
  options: readonly { value: string; label: string }[]
  disabled?: boolean
  onChange: (value: string) => void
}

function FilterGroup({ label, value, options, disabled, onChange }: FilterGroupProps) {
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </legend>

      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={selected}
              className={cn(
                'inline-flex h-9 select-none items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors disabled:opacity-50',
                selected
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground active:bg-accent md:hover:bg-accent',
              )}
            >
              {selected ? <Check className="h-3.5 w-3.5" /> : null}
              {option.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
