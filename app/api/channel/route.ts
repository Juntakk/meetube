import { NextResponse } from 'next/server'

import { getQuota } from '@/lib/quota'
import { fetchChannelUploads, YouTubeApiError } from '@/lib/youtube-server'
import type { SearchResponse } from '@/lib/youtube'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 30

/**
 * A page of a channel's uploads, newest first, for 2 units.
 *
 * Deliberately separate from /api/search: a channel-scoped search.list would
 * cost 100 units and, worse, would spend one of the 100 daily *searches*.
 * Paging through a channel here spends neither.
 */
export async function GET(request: Request) {
  const apiKey = process.env.YOUTUBE_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'YOUTUBE_API_KEY is not set.' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const channelId = searchParams.get('id')?.trim()
  const pageToken = searchParams.get('pageToken')?.trim() || undefined

  if (!channelId) {
    return NextResponse.json({ error: 'Missing channel id.' }, { status: 400 })
  }

  try {
    const { items, nextPageToken } = await fetchChannelUploads(apiKey, channelId, {
      max: PAGE_SIZE,
      pageToken,
    })

    return NextResponse.json<SearchResponse>({
      items,
      nextPageToken,
      // The Shorts count isn't tracked per page here; the grid speaks for itself.
      filteredOut: 0,
      quota: await getQuota(),
    })
  } catch (error) {
    if (error instanceof YouTubeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error('[api/channel]', error)
    return NextResponse.json({ error: 'Could not reach YouTube.' }, { status: 502 })
  }
}
