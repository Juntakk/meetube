'use client'

import * as React from 'react'
import { Loader2, Search, X } from 'lucide-react'

import { SearchSuggestions } from '@/components/search-suggestions'
import { useSearchHints } from '@/lib/suggestions'
import { cn } from '@/lib/utils'

type SearchBoxProps = {
  /** The committed query, used to reset the box after navigation. */
  query: string
  onSearch: (query: string) => void
  busy?: boolean
}

/**
 * The desktop search bar: a rounded-full field with the magnifier fused to its
 * right edge, exactly as youtube.com draws it.
 *
 * Only rendered from `md` up — a phone gets SearchOverlay's full-screen search
 * screen instead, which is what the real app does at that width.
 */
export function SearchBox({ query, onSearch, busy = false }: SearchBoxProps) {
  const [input, setInput] = React.useState(query)
  const [open, setOpen] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(-1)

  const { items, typed, addRecent, removeRecent, clearRecent } = useSearchHints(input, open)
  const listId = React.useId()

  // Keep the box in step when navigation changes the query — the back button, a
  // recent-search chip, or landing on a shared link.
  React.useEffect(() => setInput(query), [query])

  const visible = open && items.length > 0

  // A shrinking list must never leave the highlight pointing past the end.
  React.useEffect(() => setActiveIndex(-1), [typed])

  const submit = React.useCallback(
    (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) return

      setOpen(false)
      setActiveIndex(-1)
      addRecent(trimmed)
      onSearch(trimmed)
    },
    [addRecent, onSearch],
  )

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
      return
    }

    if (!visible) return

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      // Wraps through -1, so arrowing past either end returns what you typed.
      setActiveIndex((current) => {
        const next = current + delta
        if (next >= items.length) return -1
        if (next < -1) return items.length - 1
        return next
      })
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        // A highlighted suggestion wins over the raw text, as on YouTube.
        submit(activeIndex >= 0 ? items[activeIndex].value : input)
      }}
      className="relative flex w-full"
      role="search"
    >
      <div
        className={cn(
          'flex min-w-0 flex-1 items-center rounded-l-full border bg-background pl-4 pr-1 transition-colors',
          // The only cue that typing goes here, so it's worth the extra class.
          open ? 'border-ring' : 'border-input',
        )}
      >
        <input
          value={input}
          onChange={(event) => {
            setInput(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          placeholder="Search"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          aria-label="Search YouTube"
          role="combobox"
          aria-expanded={visible}
          aria-controls={visible ? listId : undefined}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        />

        {input ? (
          <button
            type="button"
            aria-label="Clear search"
            // Runs before blur closes the dropdown, so the click still lands.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setInput('')}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <button
        type="submit"
        aria-label="Search"
        disabled={busy || !input.trim()}
        className="-ml-px grid w-16 shrink-0 place-items-center rounded-r-full border border-input bg-muted/60 text-foreground transition-colors hover:bg-accent disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        ) : (
          <Search className="h-5 w-5" aria-hidden />
        )}
      </button>

      {visible ? (
        <SearchSuggestions
          items={items}
          activeIndex={activeIndex}
          listId={listId}
          showClear={typed === ''}
          onSelect={submit}
          onHover={setActiveIndex}
          onRemove={removeRecent}
          onClear={clearRecent}
        />
      ) : null}
    </form>
  )
}
