'use client'

import * as React from 'react'
import { ExternalLink, Gauge } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { QuotaInfo } from '@/lib/youtube'

/**
 * Live quota indicator.
 *
 * Search and featured responses carry a fresh snapshot, so the meter updates the
 * moment you spend anything — no polling. It only fetches on mount, to show a
 * figure before you've done anything.
 */
const QUOTA_EVENT = 'meetube:quota'

/** Called from anywhere holding a response that included a quota snapshot. */
export function publishQuota(quota: QuotaInfo | undefined) {
  if (!quota) return
  window.dispatchEvent(new CustomEvent<QuotaInfo>(QUOTA_EVENT, { detail: quota }))
}

function formatReset(ms: number): string {
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)

  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function QuotaMeter() {
  const [quota, setQuota] = React.useState<QuotaInfo | null>(null)
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState('')

  React.useEffect(() => {
    let cancelled = false

    fetch('/api/quota')
      .then((response) => response.json())
      .then((data: QuotaInfo) => {
        if (!cancelled) setQuota(data)
      })
      .catch(() => {
        // A missing meter is not worth surfacing an error for.
      })

    const onQuota = (event: Event) => setQuota((event as CustomEvent<QuotaInfo>).detail)
    window.addEventListener(QUOTA_EVENT, onQuota)

    return () => {
      cancelled = true
      window.removeEventListener(QUOTA_EVENT, onQuota)
    }
  }, [])

  const correct = React.useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch('/api/quota', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (response.ok) setQuota((await response.json()) as QuotaInfo)
  }, [])

  if (!quota) return null

  const pctUsed = Math.min(100, (quota.searches.used / quota.searches.limit) * 100)

  // Thresholds are in searches left, not percent — that's the unit that means
  // something when you're deciding whether to run one more query.
  const level =
    quota.searchesLeft <= 0
      ? 'out'
      : quota.searchesLeft <= 10
        ? 'low'
        : quota.searchesLeft <= 30
          ? 'mid'
          : 'ok'

  const barColour = {
    ok: 'bg-primary',
    mid: 'bg-amber-500',
    low: 'bg-orange-500',
    out: 'bg-destructive',
  }[level]

  const textColour = {
    ok: 'text-muted-foreground',
    mid: 'text-amber-500',
    low: 'text-orange-500',
    out: 'text-destructive',
  }[level]

  /*
   * "≤" is load-bearing, and chosen over "~" because it is literally true: the
   * ledger only knows what this app spent, so the real figure can be lower but
   * never higher. Stating a bare number we can't back up is exactly how it came
   * to claim 91 searches remained while the API was already refusing them.
   */
  const label = quota.exhausted
    ? 'Quota used up'
    : `${quota.trustworthy ? '' : '≤'}${quota.searchesLeft} searches left`

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDraft(String(quota.searches.used))
          setOpen(true)
        }}
        className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title="Quota details"
      >
        <Gauge className={cn('h-4 w-4 shrink-0', textColour)} aria-hidden />

        <span className="min-w-0">
          <span className={cn('block whitespace-nowrap text-xs font-medium tabular-nums', textColour)}>
            {label}
          </span>

          <span
            className="mt-0.5 block h-1 w-20 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={Math.round(pctUsed)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Daily search quota used"
          >
            <span
              className={cn('block h-full rounded-full transition-all', barColour)}
              style={{ width: `${pctUsed}%` }}
            />
          </span>
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Daily quota</DialogTitle>
            <DialogDescription>
              Resets in {formatReset(quota.resetsIn)}, at midnight Pacific.
            </DialogDescription>
          </DialogHeader>

          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Searches</dt>
              <dd className="tabular-nums">
                {quota.searches.used} / {quota.searches.limit} used
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Units</dt>
              <dd className="tabular-nums">
                {quota.units.used.toLocaleString()} / {quota.units.limit.toLocaleString()}
              </dd>
            </div>
          </dl>

          <p className="text-xs text-muted-foreground">
            Search has its own daily limit, separate from the unit budget — browsing categories and
            channels keeps working after searches run out.
            {!quota.trustworthy && !quota.exhausted
              ? ' This count started mid-day, so real usage may be higher than shown.'
              : null}
          </p>

          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-xs font-medium">Correct the count</p>
            <div className="flex gap-2">
              <Input
                type="number"
                min={0}
                max={quota.searches.limit}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="h-9"
                aria-label="Searches used today"
              />
              <Button
                size="sm"
                className="h-9 shrink-0"
                onClick={() => correct({ searchesUsed: Number(draft) })}
              >
                Set
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 shrink-0"
                onClick={() => correct({ action: 'exhausted' })}
              >
                All used
              </Button>
            </div>
            <a
              href="https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Check the real figure in Google Cloud
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
