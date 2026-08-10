'use client'

import { Check } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { INTERESTS } from '@/lib/interests'
import { cn } from '@/lib/utils'

type InterestPickerProps = {
  enabledIds: string[]
  onToggle: (id: string) => void
  onReset: () => void
  allOn: boolean
}

export function InterestPicker({ enabledIds, onToggle, onReset, allOn }: InterestPickerProps) {
  return (
    <div className="space-y-2.5 rounded-xl bg-card p-3">
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
