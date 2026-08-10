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
import { usePrefs } from '@/lib/prefs'
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
  const [budgetDraft, setBudgetDraft] = React.useState('')
  const { prefs, set: setPrefs } = usePrefs()

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
      {/*
        Two shapes for one control. The phone's app bar has room for an icon and
        a number and nothing else, so the bar and the wording only appear once
        there's space for them — a wrapped app bar is the thing this redesign is
        most trying to avoid.
      */}
      <button
        type="button"
        onClick={() => {
          setDraft(String(quota.searches.used))
          setBudgetDraft(String(quota.budget))
          setOpen(true)
        }}
        aria-label={`Quota: ${label}`}
        className="flex min-w-0 shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-left active:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hover:bg-accent"
        title={`Quota — ${label}`}
      >
        <Gauge className={cn('h-5 w-5 shrink-0 md:h-4 md:w-4', textColour)} aria-hidden />

        {/* Just the count on a phone. */}
        <span className={cn('text-xs font-medium tabular-nums md:hidden', textColour)}>
          {quota.exhausted ? '0' : quota.searchesLeft}
        </span>

        <span className="hidden min-w-0 md:block">
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
        <DialogContent className="sm:max-w-md">
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

          {quota.backend === 'memory' ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs text-amber-500">
              This count is held in memory only and resets whenever the server restarts — the usual
              case on serverless hosting. Connect a Redis store (Vercel KV or Upstash) to make it
              persist.
            </p>
          ) : null}

          <div className="space-y-3 rounded-lg border p-3">
            <div className="space-y-1.5">
              <label htmlFor="budget" className="text-xs font-medium">
                Daily search limit
              </label>
              <div className="flex gap-2">
                <Input
                  id="budget"
                  type="number"
                  min={1}
                  max={100}
                  value={budgetDraft}
                  onChange={(event) => setBudgetDraft(event.target.value)}
                  className="h-9"
                />
                <Button
                  size="sm"
                  className="h-9 shrink-0"
                  onClick={() => correct({ budget: Number(budgetDraft) })}
                >
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Searches are refused once you hit this, before any request is sent — so the rest of
                the day&rsquo;s quota is protected.
              </p>
            </div>

            <label className="flex items-start gap-2.5 border-t pt-3">
              <input
                type="checkbox"
                checked={prefs.autoLoad}
                onChange={(event) => setPrefs({ autoLoad: event.target.checked })}
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
              />
              <span className="space-y-0.5">
                <span className="block text-xs font-medium">Load more results as I scroll</span>
                <span className="block text-xs text-muted-foreground">
                  Off by default. Each auto-loaded page costs a full search (101 units), which is
                  the easiest way to burn quota without noticing.
                </span>
              </span>
            </label>
          </div>

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
