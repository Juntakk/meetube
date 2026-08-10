'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Search, X } from 'lucide-react'

import { SearchSuggestions } from '@/components/search-suggestions'
import { filtersToParams, parseFilters } from '@/lib/filters'
import { useSearchHints } from '@/lib/suggestions'

/**
 * The phone's search screen.
 *
 * On a phone YouTube doesn't put an input in the app bar — the magnifier swaps
 * the whole bar for a dedicated search screen with a back arrow, and the
 * suggestion list fills the page. That's what this is. Deliberately not a route:
 * dismissing it has to leave you exactly where you were, and it must not add a
 * history entry that the back button then has to walk through.
 *
 * Mounted once in the root layout, because the dock's Search tab is on every page
 * — including the ones with no results view to hand it a callback.
 */

const OPEN_EVENT = 'meetube:open-search'

/** Called by the app bar's magnifier and by the dock's Search tab. */
export function openSearchOverlay() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

export function SearchOverlay() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [open, setOpen] = React.useState(false)
  const [input, setInput] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  const { items, typed, addRecent, removeRecent, clearRecent } = useSearchHints(input, open)
  const listId = React.useId()

  /** The committed query, when there is one — only the results page has one. */
  const query = (pathname === '/' && searchParams.get('q')) || ''

  React.useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  // Opening starts from the committed query, matching youtube.com — the text is
  // there, selected, so the next keystroke replaces it.
  React.useEffect(() => {
    if (!open) return

    setInput(query)

    const frame = requestAnimationFrame(() => {
      const element = inputRef.current
      element?.focus()
      element?.select()
    })

    return () => cancelAnimationFrame(frame)
  }, [open, query])

  React.useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const submit = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return

    addRecent(trimmed)
    setOpen(false)

    /*
     * Filters carry across, because refining a search shouldn't silently reset
     * "uploaded this week" — but the category and the Saved view don't, since
     * both describe a different screen than the one you just asked for.
     */
    const params = new URLSearchParams()
    params.set('q', trimmed)
    if (pathname === '/') filtersToParams(parseFilters(searchParams), params)

    router.push(`/?${params}`)
  }

  if (!open) return null

  return (
    <div
      // Above the app bar and the dock. md:hidden because the desktop bar has a
      // real input and never needs this.
      className="fixed inset-0 z-50 flex flex-col bg-background pt-safe-t md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit(input)
        }}
        role="search"
        className="flex h-app-bar shrink-0 items-center gap-1 px-1"
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close search"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-foreground active:bg-accent"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>

        <div className="flex min-w-0 flex-1 items-center rounded-full bg-muted pl-4 pr-1">
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Search YouTube"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            aria-label="Search YouTube"
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls={items.length > 0 ? listId : undefined}
            // text-base, not text-sm: anything smaller and iOS Safari zooms the
            // page in the moment the field takes focus.
            className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-base text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          />

          {input ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setInput('')
                inputRef.current?.focus()
              }}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground active:bg-accent"
            >
              <X className="h-5 w-5" />
            </button>
          ) : null}
        </div>

        <button
          type="submit"
          aria-label="Search"
          disabled={!input.trim()}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-foreground active:bg-accent disabled:opacity-40"
        >
          <Search className="h-5 w-5" />
        </button>
      </form>

      <SearchSuggestions
        variant="page"
        items={items}
        activeIndex={-1}
        listId={listId}
        showClear={typed === ''}
        onSelect={submit}
        onHover={() => {}}
        onRemove={removeRecent}
        onClear={clearRecent}
        onRefine={(value) => {
          setInput(value)
          inputRef.current?.focus()
        }}
      />
    </div>
  )
}
