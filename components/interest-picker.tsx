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
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Feed topics
        </p>
        {!allOn ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-muted-foreground"
            onClick={onReset}
          >
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
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                on
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              {on ? <Check className="h-3 w-3" /> : null}
              {interest.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
