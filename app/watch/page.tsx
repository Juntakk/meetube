import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertCircle } from 'lucide-react'

import { SiteHeader } from '@/components/site-header'
import { WatchView } from '@/components/watch-view'
import { isAuthConfigured } from '@/lib/auth'
import {
  fetchChannel,
  fetchChannelUploads,
  fetchVideoById,
  YouTubeApiError,
} from '@/lib/youtube-server'
import type { ChannelInfo, VideoResult } from '@/lib/youtube'

// The video id is the whole input, and its stats change; nothing to prerender.
export const dynamic = 'force-dynamic'

/** Enough to fill the sidebar and give autoplay somewhere to go for a while. */
const SIDEBAR_SIZE = 25

type WatchPageProps = {
  searchParams: { v?: string }
}

export function generateMetadata({ searchParams }: WatchPageProps): Metadata {
  // Not the video's real title: Next runs this separately from the page, so
  // fetching it here would double the videos.list cost of every watch.
  return { title: searchParams.v ? 'Watch — MeeTube' : 'MeeTube' }
}

/**
 * A real route rather than a modal, matching youtube.com's /watch?v=.
 *
 * That means the URL is shareable, the back button returns to the results you
 * came from, and a refresh keeps playing the same video — none of which a
 * dialog over the search page could do.
 *
 * Costs 4 quota units: videos.list (1) + channels.list (1) + the sidebar's
 * playlistItems and videos (2). No search.list, so the 100-a-day search ceiling
 * is untouched however much you watch.
 */
export default async function WatchPage({ searchParams }: WatchPageProps) {
  const videoId = searchParams.v?.trim()

  if (!videoId) notFound()

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return <WatchError message="YOUTUBE_API_KEY is not set." />

  let video: VideoResult | null
  let channel: ChannelInfo | null = null
  let related: VideoResult[] = []

  try {
    video = await fetchVideoById(apiKey, videoId)

    if (video?.channelId) {
      /*
       * Independent of each other, so they overlap — the sidebar and the
       * channel byline appear together instead of one after the other.
       */
      const [channelResult, uploads] = await Promise.all([
        fetchChannel(apiKey, video.channelId),
        fetchChannelUploads(apiKey, video.channelId, { max: SIDEBAR_SIZE }),
      ])

      channel = channelResult
      related = uploads.items
    }
  } catch (error) {
    return (
      <WatchError
        message={
          error instanceof YouTubeApiError
            ? error.message
            : 'Could not reach YouTube. Check your connection and try again.'
        }
      />
    )
  }

  if (!video) notFound()

  return (
    <main className="min-h-dvh">
      <SiteHeader authConfigured={isAuthConfigured()} />
      <WatchView video={video} channel={channel} related={related} />
    </main>
  )
}

function WatchError({ message }: { message: string }) {
  return (
    <main className="min-h-dvh">
      <SiteHeader authConfigured={isAuthConfigured()} />
      <div className="mx-3 mt-4 flex max-w-md flex-col items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-6 py-12 text-center sm:mx-auto">
        <AlertCircle className="h-8 w-8 text-destructive" aria-hidden />
        <p className="text-sm text-muted-foreground">{message}</p>
        <Link href="/" className="text-sm underline underline-offset-4">
          Back to MeeTube
        </Link>
      </div>
    </main>
  )
}
