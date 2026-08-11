'use client'

import { Check, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { FollowedChannel } from '@/lib/followed-channels'
import { INTERESTS } from '@/lib/interests'
import { cn } from '@/lib/utils'

type InterestPickerProps = {
  enabledIds: string[]
  onToggle: (id: string) => void
  onReset: () => void
  allOn: boolean
  /** Followed channels are the other half of "what my feed is built from". */
  followed?: FollowedChannel[]
  onUnfollow?: (id: string) => void
}

export function InterestPicker({
  enabledIds,
  onToggle,
  onReset,
  allOn,
  followed = [],
  onUnfollow,
}: InterestPickerProps) {
  return (
    <div className="space-y-2.5 rounded-xl bg-card p-3">
      {followed.length > 0 && onUnfollow ? (
        <div className="space-y-2 border-b pb-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Following
          </p>

          <div className="flex flex-wrap gap-2">
            {followed.map((channel) => (
              <span
                key={channel.id}
                className="inline-flex h-9 max-w-full items-center gap-1 rounded-lg bg-muted pl-3 pr-1 text-sm font-medium"
              >
                <span className="truncate">{channel.title}</span>
                <button
                  type="button"
                  aria-label={`Unfollow ${channel.title}`}
                  onClick={() => onUnfollow(channel.id)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground active:bg-accent md:hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            Reading a followed channel costs 2 quota units, against 101 for a topic search — so
            following a few is the cheapest way to fill your feed.
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Feed topics
        </p>
        {!allOn ? (
          <Button variant="ghost" size="sm" className="-mr-1.5 text-muted-foreground" onClick={onReset}>
            Reset
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {INTERESTS.map((interest) => {
          const on = enabledIds.includes(interest.id)

          return (
            <button
              key={interest.id}
              type="button"
              onClick={() => onToggle(interest.id)}
              aria-pressed={on}
              // 36px tall: these are tapped, not clicked, and a 24px chip needs
              // a second attempt often enough to be annoying.
              className={cn(
                'inline-flex h-9 select-none items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors',
                on
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground active:bg-accent md:hover:text-foreground',
              )}
            >
              {on ? <Check className="h-3.5 w-3.5" /> : null}
              {interest.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
