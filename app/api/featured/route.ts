import { NextResponse } from 'next/server'

import { getToken } from 'next-auth/jwt'

import { hasYouTubeScope } from '@/lib/oauth-scope'
import { getQuota } from '@/lib/quota'
import type { Seed } from '@/lib/taste-profile'
import {
  fetchChannelUploads,
  fetchSubscriptions,
  fetchUploadsForChannels,
  fetchVideosByIds,
  isScopeError,
  searchVideoIds,
  YouTubeApiError,
} from '@/lib/youtube-server'
import type { QuotaInfo, VideoResult } from '@/lib/youtube'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/*
 * Ceilings on seeds per refresh, so a malformed or hostile request can't drain the
 * quota. Split by kind rather than one blunt total, because the kinds differ by a
 * factor of fifty: a query seed is 101 units and one of the day's 100 searches,
 * while a channel seed is 2 units. A flat cap of five seeds allowed a request that
 * spent 505 units; these allow at most ~215.
 */
const MAX_QUERY_SEEDS = 2
const MAX_CHEAP_SEEDS = 6

/** One seed's worth of candidates. Named so the settled results can be narrowed. */
type Group = { seed: Seed; items: VideoResult[] }

export type FeaturedResponse = {
  groups: Group[]
  /** Rough quota spend, so the UI can be honest about what a refresh costs. */
  unitsSpent: number
  quota?: QuotaInfo
  /**
   * Set when the linked Google account's token can't read subscriptions. The feed
   * is still returned — built from the seeds that did work — and the UI uses this
   * to offer a re-link rather than failing the whole refresh.
   */
  scopeExpired?: boolean
}

function isSeed(value: unknown): value is Seed {
  if (!value || typeof value !== 'object') return false

  const seed = value as Partial<Seed>
  return (
    (seed.type === 'query' || seed.type === 'channel' || seed.type === 'subscriptions') &&
    typeof seed.value === 'string' &&
    typeof seed.label === 'string'
  )
}

/**
 * Fetches candidates for each seed. Ranking deliberately happens on the client:
 * the taste profile never leaves the device, and this route stays stateless.
 */
export async function POST(request: Request) {
  const apiKey = process.env.YOUTUBE_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      { error: 'YOUTUBE_API_KEY is not set. Copy .env.local.example to .env.local and add your key.' },
      { status: 500 },
    )
  }

  let seeds: Seed[]

  try {
    const body = (await request.json()) as { seeds?: unknown }
    const valid = Array.isArray(body.seeds) ? body.seeds.filter(isSeed) : []

    // Kept in request order within each kind, so the client's priorities survive.
    seeds = [
      ...valid.filter((seed) => seed.type === 'query').slice(0, MAX_QUERY_SEEDS),
      ...valid.filter((seed) => seed.type !== 'query').slice(0, MAX_CHEAP_SEEDS),
    ]
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  if (seeds.length === 0) {
    return NextResponse.json({ error: 'No seeds provided.' }, { status: 400 })
  }

  /*
   * The access token is read server-side off the session cookie and never sent
   * to the browser. `getToken` is used rather than the session callback because
   * the callback deliberately strips it.
   */
  const jwt = await getToken({ req: request as never, secret: process.env.NEXTAUTH_SECRET })
  const accessToken = typeof jwt?.accessToken === 'string' ? jwt.accessToken : undefined

  /*
   * Checked before spending the call rather than after: an old grant produces a
   * token that looks perfectly valid and is guaranteed to 403, so asking is pure
   * waste. Unknown scopes are treated as usable — see hasYouTubeScope.
   */
  const canReadSubscriptions = Boolean(accessToken) && hasYouTubeScope(jwt?.scope)

  try {
    let unitsSpent = 0
    let scopeExpired = !canReadSubscriptions && Boolean(accessToken)

    /*
     * Seeds are independent, so they run concurrently — and settle independently.
     * Promise.all here meant one seed's failure rejected the whole batch and the
     * refresh returned nothing at all: a stale OAuth grant, which only affects the
     * subscriptions seed, took down a feed that four other seeds could have filled.
     */
    const settled = await Promise.allSettled(
      seeds.map(async (seed): Promise<Group> => {
        if (seed.type === 'subscriptions') {
          if (!canReadSubscriptions) return { seed, items: [] }

          const subs = await fetchSubscriptions(apiKey, accessToken as string)
          // 1 (subscriptions) + 1 (batched channels) + 1 per channel + 1 (videos)
          const channels = subs.slice(0, 8)
          unitsSpent += 2 + channels.length + 1

          const items = await fetchUploadsForChannels(
            apiKey,
            channels.map((sub) => sub.channelId),
          )
          return { seed, items }
        }

        if (seed.type === 'channel') {
          // playlistItems (1) + videos (1); the channels.list hop is only paid
          // on the rare channel whose uploads playlist id isn't derivable.
          unitsSpent += 2
          /*
           * A full page rather than the 25 default. Same 2 units either way —
           * playlistItems costs 1 unit however many items it returns, and
           * videos.list batches up to 50 ids into one — so this doubles the
           * candidate pool for free.
           */
          const { items } = await fetchChannelUploads(apiKey, seed.value, { max: 50 })
          return { seed, items }
        }

        unitsSpent += 101
        const { ids } = await searchVideoIds(apiKey, { q: seed.value, order: 'relevance' })
        const { items } = await fetchVideosByIds(apiKey, ids)
        return { seed, items }
      }),
    )

    const groups = settled
      .filter((result): result is PromiseFulfilledResult<Group> => result.status === 'fulfilled')
      .map((result) => result.value)

    const failures = settled
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason)

    if (failures.some(isScopeError)) scopeExpired = true

    /*
     * Every seed failed, so there is no feed to return and the first failure is
     * the honest explanation — quota exhaustion above all, which must not be
     * disguised as an empty feed.
     */
    if (groups.length === 0 && failures.length > 0) throw failures[0]

    // Some seeds worked. Log what didn't rather than pretending it was complete.
    if (failures.length > 0) {
      console.warn('[api/featured] %d of %d seeds failed', failures.length, seeds.length, failures)
    }

    return NextResponse.json<FeaturedResponse>({
      groups,
      unitsSpent,
      quota: await getQuota(),
      ...(scopeExpired ? { scopeExpired: true } : {}),
    })
  } catch (error) {
    if (error instanceof YouTubeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error('[api/featured]', error)
    return NextResponse.json(
      { error: 'Could not reach YouTube. Check your connection and try again.' },
      { status: 502 },
    )
  }
}
