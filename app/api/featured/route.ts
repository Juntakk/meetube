import { NextResponse } from 'next/server'

import { getToken } from 'next-auth/jwt'

import { getQuota } from '@/lib/quota'
import type { Seed } from '@/lib/taste-profile'
import {
  fetchChannelUploads,
  fetchSubscriptions,
  fetchUploadsForChannels,
  fetchVideosByIds,
  searchVideoIds,
  YouTubeApiError,
} from '@/lib/youtube-server'
import type { QuotaInfo, VideoResult } from '@/lib/youtube'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Hard ceiling on seeds per refresh so a malformed request can't drain the quota. */
const MAX_SEEDS = 5

export type FeaturedResponse = {
  groups: Array<{ seed: Seed; items: VideoResult[] }>
  /** Rough quota spend, so the UI can be honest about what a refresh costs. */
  unitsSpent: number
  quota?: QuotaInfo
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
    seeds = Array.isArray(body.seeds) ? body.seeds.filter(isSeed).slice(0, MAX_SEEDS) : []
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

  try {
    let unitsSpent = 0

    // Seeds are independent, so fetch them concurrently.
    const groups = await Promise.all(
      seeds.map(async (seed) => {
        if (seed.type === 'subscriptions') {
          if (!accessToken) return { seed, items: [] }

          const subs = await fetchSubscriptions(apiKey, accessToken)
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
          unitsSpent += 3
          return { seed, items: await fetchChannelUploads(apiKey, seed.value) }
        }

        unitsSpent += 101
        const { ids } = await searchVideoIds(apiKey, { q: seed.value, order: 'relevance' })
        const { items } = await fetchVideosByIds(apiKey, ids)
        return { seed, items }
      }),
    )

    return NextResponse.json<FeaturedResponse>({ groups, unitsSpent, quota: await getQuota() })
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
