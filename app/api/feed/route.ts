import { NextResponse } from 'next/server'

import { FEED_CHANNELS, UPLOADS_PER_CHANNEL, shuffle } from '@/lib/channel-feed'
import { getQuota } from '@/lib/quota'
import { fetchUploadsForChannels, YouTubeApiError } from '@/lib/youtube-server'
import type { QuotaInfo, VideoResult } from '@/lib/youtube'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type FeedResponse = {
  items: VideoResult[]
  /** Rough quota spend, so the UI can be honest about what a refresh costs. */
  unitsSpent: number
  quota?: QuotaInfo
}

/**
 * The home feed: the latest uploads from a fixed, server-owned channel list,
 * shuffled.
 *
 * Deliberately a GET with no body — there is nothing for a client to supply.
 * The old /api/featured took client-chosen seeds and had to cap them against a
 * hostile request; this route has no such surface because the channel list
 * isn't client input.
 */
export async function GET() {
  const apiKey = process.env.YOUTUBE_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      { error: 'YOUTUBE_API_KEY is not set. Copy .env.local.example to .env.local and add your key.' },
      { status: 500 },
    )
  }

  try {
    const items = await fetchUploadsForChannels(
      apiKey,
      FEED_CHANNELS.map((channel) => channel.id),
      UPLOADS_PER_CHANNEL,
    )

    if (items.length < FEED_CHANNELS.length * UPLOADS_PER_CHANNEL * 0.5) {
      // Half the expected pool missing means several channels likely came back
      // empty — a renamed/deleted channel, or a dead uploads playlist — and
      // that's worth knowing about rather than a feed that's quietly thin.
      console.warn(
        '[api/feed] only %d of an expected ~%d videos returned',
        items.length,
        FEED_CHANNELS.length * UPLOADS_PER_CHANNEL,
      )
    }

    // 1 (channels.list, batched) + 1 per channel (playlistItems) + videos.list
    // chunked at 50 ids each. Matches what fetchUploadsForChannels actually
    // spends; kept in sync here only so the client can show the cost up front.
    const unitsSpent =
      1 + FEED_CHANNELS.length + Math.ceil((FEED_CHANNELS.length * UPLOADS_PER_CHANNEL) / 50)

    return NextResponse.json<FeedResponse>({
      items: shuffle(items),
      unitsSpent,
      quota: await getQuota(),
    })
  } catch (error) {
    if (error instanceof YouTubeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error('[api/feed]', error)
    return NextResponse.json(
      { error: 'Could not reach YouTube. Check your connection and try again.' },
      { status: 502 },
    )
  }
}
