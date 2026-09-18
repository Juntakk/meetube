import { NextResponse } from 'next/server'

import {
  FEED_CHANNELS,
  MAX_EXTRA_FEED_CHANNELS,
  UPLOADS_PER_CHANNEL,
  isValidChannelId,
} from '@/lib/channel-feed'
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

const FEED_IDS = new Set(FEED_CHANNELS.map((channel) => channel.id))

/**
 * The home feed: the latest uploads from a fixed, server-owned channel list
 * plus whichever channels you've followed, newest first.
 *
 * That's the canonical order this route returns — the client shuffles it
 * locally for the default view and can switch back to this order on demand,
 * without a second fetch. Sorting here rather than trusting per-channel order
 * matters because the candidates come from several channels' playlists
 * interleaved by upload depth, not by date.
 *
 * `extra` is the one piece of client input this route accepts: a comma-joined
 * list of followed channel ids from lib/followed-channels.ts, which lives in
 * localStorage and never touches the server otherwise. Everything in it is
 * validated against the actual shape of a YouTube channel id and capped —
 * this is the one surface a malformed request could abuse, where the old
 * /api/featured's client-chosen seeds had several.
 */
export async function GET(request: Request) {
  const apiKey = process.env.YOUTUBE_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      { error: 'YOUTUBE_API_KEY is not set. Copy .env.local.example to .env.local and add your key.' },
      { status: 500 },
    )
  }

  const rawExtra = new URL(request.url).searchParams.get('extra') ?? ''

  // Deduped against the fixed list too — following a channel that's already
  // in it shouldn't fetch it twice.
  const extraIds = [
    ...new Set(
      rawExtra
        .split(',')
        .map((id) => id.trim())
        .filter((id) => isValidChannelId(id) && !FEED_IDS.has(id)),
    ),
  ].slice(0, MAX_EXTRA_FEED_CHANNELS)

  const channelIds = [...FEED_CHANNELS.map((channel) => channel.id), ...extraIds]

  try {
    const items = await fetchUploadsForChannels(apiKey, channelIds, UPLOADS_PER_CHANNEL)

    if (items.length < channelIds.length * UPLOADS_PER_CHANNEL * 0.5) {
      // Half the expected pool missing means several channels likely came back
      // empty — a renamed/deleted channel, or a dead uploads playlist — and
      // that's worth knowing about rather than a feed that's quietly thin.
      console.warn(
        '[api/feed] only %d of an expected ~%d videos returned',
        items.length,
        channelIds.length * UPLOADS_PER_CHANNEL,
      )
    }

    // channels.list chunked at 50 ids + 1 per channel (playlistItems) +
    // videos.list chunked at 50 ids. Matches what fetchUploadsForChannels
    // actually spends; kept in sync here only so the client can show the cost
    // up front.
    const unitsSpent =
      Math.ceil(channelIds.length / 50) +
      channelIds.length +
      Math.ceil((channelIds.length * UPLOADS_PER_CHANNEL) / 50)

    const newestFirst = [...items].sort(
      (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
    )

    return NextResponse.json<FeedResponse>({
      items: newestFirst,
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
