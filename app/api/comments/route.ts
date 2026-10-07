import { NextResponse } from 'next/server'

import { getQuota } from '@/lib/quota'
import { fetchComments, YouTubeApiError } from '@/lib/youtube-server'
import type { CommentsResponse } from '@/lib/youtube'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Top-level comments for one video — 1 unit, same cost no matter how many
 * come back. See fetchComments in lib/youtube-server.ts for why a disabled
 * comments section is reported as data (`disabled: true`), not an error.
 */
export async function GET(request: Request) {
  const apiKey = process.env.YOUTUBE_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'YOUTUBE_API_KEY is not set.' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const videoId = searchParams.get('v')?.trim()
  const pageToken = searchParams.get('pageToken')?.trim() || undefined
  const order = searchParams.get('order') === 'time' ? 'time' : 'relevance'

  if (!videoId) {
    return NextResponse.json({ error: 'Missing video id.' }, { status: 400 })
  }

  try {
    const { items, nextPageToken, disabled } = await fetchComments(apiKey, videoId, {
      pageToken,
      order,
    })

    return NextResponse.json<CommentsResponse>({
      items,
      nextPageToken,
      disabled,
      quota: await getQuota(),
    })
  } catch (error) {
    if (error instanceof YouTubeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error('[api/comments]', error)
    return NextResponse.json({ error: 'Could not reach YouTube.' }, { status: 502 })
  }
}
