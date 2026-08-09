import { activeBackend, readLedger, writeLedger, type Backend } from '@/lib/quota-store'

/**
 * Server-side quota ledger.
 *
 * The YouTube Data API exposes no "how much have I used" endpoint — the only
 * authoritative view is the Google Cloud console. So this counts what *we*
 * spend, using the published per-method costs.
 *
 * Two counters, not one. Verified against a real exhausted key: `search.list`
 * failed with "Quota exceeded for quota metric 'Search Queries' and limit
 * 'Search Queries per day'" while `videos.list` kept working normally. Search is
 * governed by its own daily metric, so deriving "searches left" from the unit
 * budget reports searches that the API will refuse to serve.
 */

/** Published unit costs. list methods are flat-rate regardless of `part` count. */
export const COST = {
  search: 100,
  videos: 1,
  channels: 1,
  playlistItems: 1,
} as const

export const DAILY_LIMIT = 10_000

/** The separate "Search Queries per day" metric: 10,000 units ÷ 100 per search. */
export const SEARCH_LIMIT = 100

type Ledger = {
  day: string
  units: number
  searches: number
  /** User-set daily cap on searches. A preference, so it survives day rollover. */
  budget?: number
  /** Set once the API itself refuses a search; sticky for the rest of the day. */
  searchExhausted?: boolean
  /** True when this ledger has covered the day from its start. */
  fromDayStart?: boolean
}

let memory: Ledger | null = null

/**
 * Quota resets at midnight Pacific, not UTC or local — so the day key has to be
 * computed in that zone or the counter rolls over at the wrong moment.
 */
function pacificDay(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function msUntilReset(now = new Date()): number {
  // Re-express "now" in Pacific wall-clock terms, then step to the next midnight.
  const pacificNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
  const nextMidnight = new Date(pacificNow)
  nextMidnight.setHours(24, 0, 0, 0)

  return Math.max(0, nextMidnight.getTime() - pacificNow.getTime())
}

/** Hours elapsed since midnight Pacific, used to judge whether we missed any. */
function hoursIntoPacificDay(now = new Date()): number {
  return 24 - msUntilReset(now) / 3600000
}

function fresh(day: string, budget?: number): Ledger {
  return {
    day,
    units: 0,
    searches: 0,
    budget,
    // Only trustworthy if we started counting at the very top of the day.
    fromDayStart: hoursIntoPacificDay() < 0.5,
  }
}

async function load(): Promise<Ledger> {
  const today = pacificDay()

  if (memory && memory.day === today) return memory

  try {
    const raw = await readLedger()
    if (!raw) throw new Error('empty')

    const parsed = JSON.parse(raw) as Ledger

    // A ledger rolled over from an earlier Pacific day starts clean — and since
    // the rollover happened while we were running, it does cover the whole day.
    // The budget is carried across: it's a preference, not daily state.
    memory = parsed.day === today ? parsed : { ...fresh(today, parsed.budget), fromDayStart: true }
  } catch {
    // Nothing stored, or unreadable. If we're already hours into the day, we
    // have no idea what was spent before now, so the count is not trustworthy.
    memory = fresh(today)
  }

  return memory
}

async function persist(ledger: Ledger) {
  memory = ledger
  await writeLedger(JSON.stringify(ledger))
}

/**
 * Adds to today's totals. Call **after** a request succeeds — a rejected request
 * is not charged, so counting before the call inflates the total every time the
 * quota runs out or the network fails.
 */
export async function recordUsage(units: number, isSearch = false) {
  const ledger = await load()

  await persist({
    ...ledger,
    units: ledger.units + units,
    searches: ledger.searches + (isSearch ? 1 : 0),
  })
}

/** Effective cap: the user's budget, never above what the API itself allows. */
export async function searchBudget(): Promise<number> {
  const ledger = await load()
  return Math.min(SEARCH_LIMIT, ledger.budget ?? SEARCH_LIMIT)
}

/**
 * Hard stop, checked before every search.list call. This is the control that
 * actually protects the quota — lowering `maxResults` does nothing, because
 * search.list is billed at a flat 100 units regardless of how many results it
 * returns.
 */
export async function searchAllowed(): Promise<boolean> {
  const ledger = await load()
  return !ledger.searchExhausted && ledger.searches < (await searchBudget())
}

export async function setBudget(value: number) {
  const ledger = await load()
  await persist({ ...ledger, budget: Math.max(1, Math.min(SEARCH_LIMIT, Math.round(value))) })
}

export type QuotaSnapshot = {
  units: { used: number; limit: number; remaining: number }
  searches: { used: number; limit: number; remaining: number }
  /** Whole searches still affordable — the number people actually care about. */
  searchesLeft: number
  /** Milliseconds until midnight Pacific. */
  resetsIn: number
  day: string
  /** The user's self-imposed daily cap. */
  budget: number
  /** True once the API itself has started refusing searches. */
  exhausted: boolean
  /** True when the user's own cap is what's blocking, not the API. */
  budgetReached: boolean
  /**
   * False when the ledger started mid-day and may have missed earlier spend, so
   * the UI can say "at most N" rather than stating a figure it can't back up.
   */
  trustworthy: boolean
  /** Where the ledger is stored; 'memory' means it resets on every cold start. */
  backend: Backend
}

export async function getQuota(): Promise<QuotaSnapshot> {
  const ledger = await load()

  const unitsRemaining = Math.max(0, DAILY_LIMIT - ledger.units)
  const budget = Math.min(SEARCH_LIMIT, ledger.budget ?? SEARCH_LIMIT)
  const searchesRemaining = ledger.searchExhausted
    ? 0
    : Math.max(0, budget - ledger.searches)

  return {
    units: { used: ledger.units, limit: DAILY_LIMIT, remaining: unitsRemaining },
    searches: { used: ledger.searches, limit: budget, remaining: searchesRemaining },
    // Bounded by whichever metric runs out first.
    searchesLeft: Math.min(searchesRemaining, Math.floor(unitsRemaining / COST.search)),
    resetsIn: msUntilReset(),
    day: ledger.day,
    budget,
    exhausted: Boolean(ledger.searchExhausted) || unitsRemaining <= 0,
    budgetReached: !ledger.searchExhausted && ledger.searches >= budget,
    // Once the API has confirmed exhaustion, zero is a fact, not an estimate.
    trustworthy: Boolean(ledger.fromDayStart) || Boolean(ledger.searchExhausted),
    backend: activeBackend(),
  }
}

/**
 * Called when YouTube refuses a search for quota reasons. The local count can
 * drift low — a restart, a read-only filesystem, or the key used elsewhere — so
 * the API's verdict overrides the ledger and sticks for the rest of the day.
 */
export async function markExhausted() {
  const ledger = await load()

  await persist({
    ...ledger,
    searches: Math.max(ledger.searches, SEARCH_LIMIT),
    searchExhausted: true,
  })
}

/** Manual correction from the UI, for when the ledger and reality disagree. */
export async function setUsage(searchesUsed: number) {
  const ledger = await load()
  const clamped = Math.max(0, Math.min(SEARCH_LIMIT, Math.round(searchesUsed)))

  await persist({
    ...ledger,
    searches: clamped,
    units: clamped * COST.search,
    searchExhausted: clamped >= SEARCH_LIMIT,
    // A figure the user read off the console is better than anything we inferred.
    fromDayStart: true,
  })
}
