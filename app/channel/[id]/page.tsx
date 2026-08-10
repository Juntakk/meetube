import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertCircle, ExternalLink } from 'lucide-react'

import { ChannelVideos } from '@/components/channel-videos'
import { SiteHeader } from '@/components/site-header'
import { isAuthConfigured } from '@/lib/auth'
import { fetchChannel, fetchChannelUploads, YouTubeApiError } from '@/lib/youtube-server'
import { formatCompactNumber, type ChannelInfo, type VideoResult } from '@/lib/youtube'

export const dynamic = 'force-dynamic'

const FIRST_PAGE = 30

type ChannelPageProps = {
  params: { id: string }
}

export function generateMetadata(): Metadata {
  /*
   * Deliberately generic. Putting the channel's real name here would mean a
   * second channels.list call, since Next runs generateMetadata and the page
   * as separate invocations — a whole extra unit for a browser tab label.
   */
  return { title: 'Channel — MeeTube' }
}

/**
 * A channel's own page: banner, avatar, subscriber count, and its videos.
 *
 * Costs 3 units — channels.list (1) plus the first page of uploads (2). The old
 * "Videos from X" banner over a search cost 101 and burned one of the 100 daily
 * searches to show the same thing.
 */
export default async function ChannelPage({ params }: ChannelPageProps) {
  const channelId = params.id?.trim()

  // Channel ids are always UC + 22 url-safe characters; anything else is a
  // handle or junk, and forwarding it would waste a unit on a guaranteed miss.
  if (!/^UC[\w-]{22}$/.test(channelId)) notFound()

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return <ChannelError message="YOUTUBE_API_KEY is not set." />

  let channel: ChannelInfo | null
  let items: VideoResult[] = []
  let nextPageToken: string | null = null

  try {
    const [channelResult, uploads] = await Promise.all([
      fetchChannel(apiKey, channelId),
      fetchChannelUploads(apiKey, channelId, { max: FIRST_PAGE }),
    ])

    channel = channelResult
    items = uploads.items
    nextPageToken = uploads.nextPageToken
  } catch (error) {
    return (
      <ChannelError
        message={
          error instanceof YouTubeApiError
            ? error.message
            : 'Could not reach YouTube. Check your connection and try again.'
        }
      />
    )
  }

  if (!channel) notFound()

  return (
    <main className="min-h-dvh">
      <SiteHeader authConfigured={isAuthConfigured()} />

      <div className="mx-auto w-full max-w-[1600px] pb-8 sm:px-4">
        {/*
          A short strip on a phone and the full 6.2:1 letterbox from md up, which
          is how YouTube crops a channel banner at each width — the art is
          designed for the wide crop and looks empty when it's forced tall.
        */}
        {channel.banner ? (
          <div className="relative aspect-[4/1] w-full overflow-hidden bg-muted sm:mt-2 sm:aspect-[6.2/1] sm:rounded-xl">
            <Image
              src={channel.banner}
              alt=""
              fill
              sizes="(max-width: 1600px) 100vw, 1600px"
              className="object-cover"
              priority
            />
          </div>
        ) : null}

        {/* Avatar beside the name on a phone, above it on desktop — YouTube's own split. */}
        <div className="flex items-start gap-4 px-3 py-4 sm:px-0 md:items-center">
          {channel.avatar ? (
            <Image
              src={channel.avatar}
              alt=""
              width={128}
              height={128}
              className="h-16 w-16 shrink-0 rounded-full md:h-32 md:w-32"
              priority
            />
          ) : null}

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold tracking-tight md:text-3xl">
              {channel.title}
            </h1>

            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[0.8125rem] text-muted-foreground md:text-sm">
              {channel.handle ? <span>{channel.handle}</span> : null}
              {channel.handle && channel.subscriberCount !== null ? (
                <span aria-hidden>&middot;</span>
              ) : null}
              {channel.subscriberCount !== null ? (
                <span>{formatCompactNumber(channel.subscriberCount)} subscribers</span>
              ) : null}
              {channel.videoCount !== null ? (
                <>
                  <span aria-hidden>&middot;</span>
                  <span>{formatCompactNumber(channel.videoCount)} videos</span>
                </>
              ) : null}
            </p>

            {channel.description ? (
              <p className="mt-1 line-clamp-1 max-w-2xl text-[0.8125rem] text-muted-foreground md:line-clamp-2 md:text-sm">
                {channel.description}
              </p>
            ) : null}

            <a
              href={`https://www.youtube.com/channel/${channel.id}`}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full bg-muted px-3 text-xs font-medium text-foreground active:bg-accent md:hover:bg-accent"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open on YouTube
            </a>
          </div>
        </div>

        <ChannelVideos
          channelId={channel.id}
          initialItems={items}
          initialPageToken={nextPageToken}
        />
      </div>
    </main>
  )
}

function ChannelError({ message }: { message: string }) {
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
