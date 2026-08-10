'use client'

import { ArrowUpLeft, Clock, Search, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { Suggestion } from '@/lib/suggestions'

export type { Suggestion }

type SearchSuggestionsProps = {
  items: Suggestion[]
  /** -1 when nothing is highlighted, i.e. Enter should submit what's typed. */
  activeIndex: number
  onSelect: (query: string) => void
  onHover: (index: number) => void
  onRemove: (query: string) => void
  onClear: () => void
  /** The "Clear all" affordance only makes sense over a list of recents. */
  showClear: boolean
  listId: string
  /**
   * `panel` is the desktop dropdown under the box. `page` is the phone's
   * full-screen search view: taller rows for thumbs, no card around it, and the
   * arrow that puts a suggestion in the box without running it.
   */
  variant?: 'panel' | 'page'
  /** Only meaningful for `page`, which is the only variant that can refine. */
  onRefine?: (query: string) => void
}

/**
 * The list under the search box: recent searches while it's empty, YouTube's own
 * suggestions once you start typing.
 *
 * Every interactive element in the dropdown calls preventDefault on mousedown:
 * without it the input's blur fires first, the panel unmounts, and the click
 * never lands on anything.
 */
export function SearchSuggestions({
  items,
  activeIndex,
  onSelect,
  onHover,
  onRemove,
  onClear,
  showClear,
  listId,
  variant = 'panel',
  onRefine,
}: SearchSuggestionsProps) {
  if (items.length === 0) return null

  const page = variant === 'page'

  return (
    <div
      className={cn(
        page
          ? 'flex min-h-0 flex-1 flex-col'
          : 'absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-xl border bg-popover shadow-xl',
      )}
      onMouseDown={page ? undefined : (event) => event.preventDefault()}
    >
      {showClear ? (
        <div className={cn('flex items-center justify-between px-4 py-2', page && 'px-4 pt-3')}>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recent
          </span>
          <button
            type="button"
            onClick={onClear}
            className="-mr-2 rounded-full px-2 py-1 text-xs text-muted-foreground active:bg-accent md:hover:text-foreground"
          >
            Clear all
          </button>
        </div>
      ) : null}

      <ul
        id={listId}
        role="listbox"
        className={cn(
          page ? 'min-h-0 flex-1 overflow-y-auto pb-dock-safe' : 'max-h-[60vh] overflow-y-auto py-1',
        )}
      >
        {items.map((item, index) => (
          <li
            key={`${item.source}:${item.value}`}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === activeIndex}
            onMouseEnter={() => onHover(index)}
            className={cn(
              'flex items-center',
              index === activeIndex && 'bg-accent/60',
              page && 'active:bg-accent/60',
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(item.value)}
              className={cn(
                'flex min-w-0 flex-1 items-center gap-3 text-left',
                page ? 'px-4 py-3 text-base' : 'px-4 py-2.5 text-sm',
              )}
            >
              {item.source === 'recent' ? (
                <Clock
                  className={cn('shrink-0 text-muted-foreground', page ? 'h-5 w-5' : 'h-4 w-4')}
                  aria-hidden
                />
              ) : (
                <Search
                  className={cn('shrink-0 text-muted-foreground', page ? 'h-5 w-5' : 'h-4 w-4')}
                  aria-hidden
                />
              )}
              <span className="truncate">{item.value}</span>
            </button>

            {item.source === 'recent' ? (
              <button
                type="button"
                aria-label={`Remove ${item.value} from recent searches`}
                onClick={() => onRemove(item.value)}
                className={cn(
                  'grid shrink-0 place-items-center text-muted-foreground md:hover:text-foreground',
                  page ? 'h-11 w-11' : 'h-9 w-9',
                )}
              >
                <X className={page ? 'h-5 w-5' : 'h-4 w-4'} />
              </button>
            ) : null}

            {/* YouTube's "put this in the box but don't search yet" affordance. */}
            {page && onRefine && item.source !== 'recent' ? (
              <button
                type="button"
                aria-label={`Edit search ${item.value}`}
                onClick={() => onRefine(item.value)}
                className="grid h-11 w-11 shrink-0 place-items-center text-muted-foreground"
              >
                <ArrowUpLeft className="h-5 w-5" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
