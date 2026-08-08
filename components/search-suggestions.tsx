'use client'

import { Clock, X } from 'lucide-react'

type SearchSuggestionsProps = {
  recent: string[]
  onSelect: (query: string) => void
  onRemove: (query: string) => void
  onClear: () => void
}

/**
 * Recent searches, shown under the search bar while it's focused and empty.
 *
 * Every interactive element here calls preventDefault on mousedown: without it
 * the input's blur fires first, the panel unmounts, and the click never lands
 * on anything.
 */
export function SearchSuggestions({ recent, onSelect, onRemove, onClear }: SearchSuggestionsProps) {
  if (recent.length === 0) return null

  return (
    <div
      className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border bg-popover shadow-lg"
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Recent
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Clear all
        </button>
      </div>

      <ul className="max-h-72 overflow-y-auto pb-1">
        {recent.map((term) => (
          <li key={term} className="flex items-center">
            <button
              type="button"
              onClick={() => onSelect(term)}
              className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{term}</span>
            </button>
            <button
              type="button"
              aria-label={`Remove ${term} from recent searches`}
              onClick={() => onRemove(term)}
              className="px-3 py-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
