/**
 * Server-only YouTube helpers. Shared by /api/search and /api/featured so the
 * Shorts filter, thumbnail choice and error handling can't drift between them.
 *
 * Never import this from a client component — it reads the API key.
 */

import { COST, markExhausted, recordUsage, searchAllowed, searchBudget } from '@/lib/quota'
import {
  decodeHtmlEntities,
  formatDuration,
  isShort,
  parseCount,
  parseISO8601Duration,
  type VideoResult,
} from '@/lib/youtube'

const SEARCH_ENDPOINT = 'https://www.googleapis.com/youtube/v3/search'
const VIDEOS_ENDPOINT = 'https://www.googleapis.com/youtube/v3/videos'
const CHANNELS_ENDPOINT = 'https://www.googleapis.com/youtube/v3/channels'
const SUBSCRIPTIONS_ENDPOINT = 'https://www.googleapis.com/youtube/v3/subscriptions'
const PLAYLIST_ITEMS_ENDPOINT = 'https://www.googleapis.com/youtube/v3/playlistItems'

/** search.list and videos.list both cap maxResults at 50. */
export const RESULTS_PER_PAGE = 50

export class YouTubeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'YouTubeApiError'
  }
}

type YouTubeThumbnails = Record<string, { url: string; width?: number; height?: number } | undefined>

type RawVideo = {
  id: string
  snippet?: {
    title?: string
    channelTitle?: string
    channelId?: string
    publishedAt?: string
    description?: string
    liveBroadcastContent?: string
    thumbnails?: YouTubeThumbnails
  }
  contentDetails?: { duration?: string }
  statistics?: { viewCount?: string; likeCount?: string }
}

function pickThumbnail(thumbnails: YouTubeThumbnails | undefined): string {
  if (!thumbnails) return ''

  // Widest available first — cards render at up to ~480px on desktop.
  for (const key of ['maxres', 'standard', 'high', 'medium', 'default']) {
    const candidate = thumbnails[key]
    if (candidate?.url) return candidate.url
  }

  return ''
}

/** Reads Google's error envelope so the client can show something better than "500". */
async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string; errors?: Array<{ reason?: string }> }
    }

    const reason = body.error?.errors?.[0]?.reason
    const message = body.error?.message ?? ''

    /*
     * Daily exhaustion does NOT report reason "quotaExceeded" as the docs imply.
     * Verified against a real exhausted key: HTTP 429, status RESOURCE_EXHAUSTED,
     * reason "rateLimitExceeded", message "Quota exceeded for quota metric
     * 'Search Queries' and limit 'Search Queries per day'".
     *
     * "rateLimitExceeded" is also used for short-term throttling, which is
     * transient and must not mark the whole day spent — so the "per day" in the
     * message is what distinguishes them.
     */
    const isDailyQuota =
      reason === 'quotaExceeded' ||
      reason === 'dailyLimitExceeded' ||
      (/quota exceeded/i.test(message) && /per day/i.test(message))

    if (isDailyQuota) {
      // The API is authoritative; our ledger may have drifted low.
      markExhausted()
      return 'Daily YouTube API quota used up. It resets at midnight Pacific Time.'
    }

    if (response.status === 429 || reason === 'rateLimitExceeded') {
      return 'Too many requests in a short time. Wait a moment and try again.'
    }

    if (reason === 'keyInvalid' || reason === 'badRequest') {
      return 'The YouTube API key was rejected. Check YOUTUBE_API_KEY in .env.local.'
    }

    return message || fallback
  } catch {
    return fallback
  }
}

/**
 * Records the cost only on success. A rejected request isn't charged, so counting
 * before the call inflated the ledger every time quota ran out or a fetch failed.
 */
async function call<T>(
  url: URL,
  fallbackMessage: string,
  cost: { units: number; isSearch?: boolean; accessToken?: string },
): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    // OAuth calls (anything reading "mine=true") need a bearer token; the API
    // key alone can only see public data.
    headers: cost.accessToken ? { Authorization: `Bearer ${cost.accessToken}` } : undefined,
  })

  if (!response.ok) {
    throw new YouTubeApiError(await readApiError(response, fallbackMessage), response.status)
  }

  recordUsage(cost.units, cost.isSearch)

  return (await response.json()) as T
}

function endpoint(base: string, apiKey: string, params: Record<string, string | undefined>): URL {
  const url = new URL(base)
  url.searchParams.set('key', apiKey)

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, value)
  }

  return url
}

function mapVideo(raw: RawVideo): VideoResult | null {
  if (!raw.snippet) return null

  const durationSeconds = parseISO8601Duration(raw.contentDetails?.duration)

  return {
    id: raw.id,
    title: decodeHtmlEntities(raw.snippet.title ?? 'Untitled'),
    channelTitle: decodeHtmlEntities(raw.snippet.channelTitle ?? 'Unknown channel'),
    channelId: raw.snippet.channelId ?? '',
    publishedAt: raw.snippet.publishedAt ?? '',
    description: decodeHtmlEntities(raw.snippet.description ?? ''),
    thumbnail: pickThumbnail(raw.snippet.thumbnails),
    durationSeconds,
    duration: formatDuration(durationSeconds),
    viewCount: parseCount(raw.statistics?.viewCount),
    likeCount: parseCount(raw.statistics?.likeCount),
  }
}

/** Applies the Shorts filter and skips live/upcoming broadcasts. */
function filterVideos(raws: RawVideo[]): { items: VideoResult[]; filteredOut: number } {
  const items: VideoResult[] = []
  let filteredOut = 0

  for (const raw of raws) {
    // Live and upcoming broadcasts report a zero duration, which would look
    // like a Short. Drop them explicitly rather than by length.
    if (raw.snippet?.liveBroadcastContent && raw.snippet.liveBroadcastContent !== 'none') {
      continue
    }

    const mapped = mapVideo(raw)
    if (!mapped) continue

    if (isShort(mapped.durationSeconds)) {
      filteredOut += 1
      continue
    }

    items.push(mapped)
  }

  return { items, filteredOut }
}

/**
 * videos.list for a set of IDs. Costs 1 unit no matter how many parts or IDs,
 * which is why every path here batches into a single call.
 */
export async function fetchVideosByIds(
  apiKey: string,
  ids: string[],
): Promise<{ items: VideoResult[]; filteredOut: number }> {
  if (ids.length === 0) return { items: [], filteredOut: 0 }

  const data = await call<{ items?: RawVideo[] }>(
    endpoint(VIDEOS_ENDPOINT, apiKey, {
      part: 'contentDetails,snippet,statistics',
      id: ids.join(','),
      maxResults: String(RESULTS_PER_PAGE),
    }),
    'Failed to load video details.',
    { units: COST.videos },
  )

  const byId = new Map((data.items ?? []).map((item) => [item.id, item]))

  // Restore the caller's ordering, which videos.list does not preserve.
  const ordered = ids.map((id) => byId.get(id)).filter((item): item is RawVideo => Boolean(item))

  return filterVideos(ordered)
}

/** search.list — 100 units. The expensive path. */
export async function searchVideoIds(
  apiKey: string,
  params: {
    q?: string
    channelId?: string
    pageToken?: string
    order?: string
    publishedAfter?: string
    videoDuration?: string
    videoCategoryId?: string
  },
): Promise<{ ids: string[]; nextPageToken: string | null }> {
  /*
   * Enforced here rather than in the route so every caller is covered — plain
   * search, the category fallback, channel browsing and the featured feed all
   * funnel through this function. Throwing before the fetch means the request is
   * never made and no quota is spent.
   */
  if (!searchAllowed()) {
    throw new YouTubeApiError(
      `Daily search limit reached (${searchBudget()}). Raise it in the quota panel, or wait for the reset at midnight Pacific.`,
      429,
    )
  }

  const data = await call<{ nextPageToken?: string; items?: Array<{ id?: { videoId?: string } }> }>(
    endpoint(SEARCH_ENDPOINT, apiKey, {
      part: 'snippet',
      type: 'video',
      maxResults: String(RESULTS_PER_PAGE),
      // Everything opens in an embedded player, so skip results that can't be embedded.
      videoEmbeddable: 'true',
      ...params,
    }),
    'YouTube search failed.',
    { units: COST.search, isSearch: true },
  )

  return {
    ids: (data.items ?? [])
      .map((item) => item.id?.videoId)
      .filter((id): id is string => Boolean(id)),
    nextPageToken: data.nextPageToken ?? null,
  }
}

/**
 * A channel's recent uploads for **3 units** instead of the 100 a channel-scoped
 * search.list would cost: channels.list (1) -> playlistItems.list (1) ->
 * videos.list (1). Worth the extra hops given the 10,000/day cap.
 */
export async function fetchChannelUploads(
  apiKey: string,
  channelId: string,
  max = 25,
): Promise<VideoResult[]> {
  const channelData = await call<{
    items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }>
  }>(
    endpoint(CHANNELS_ENDPOINT, apiKey, { part: 'contentDetails', id: channelId }),
    'Failed to load channel.',
    { units: COST.channels },
  )

  const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!uploadsPlaylistId) return []

  const playlistData = await call<{
    items?: Array<{ contentDetails?: { videoId?: string } }>
  }>(
    endpoint(PLAYLIST_ITEMS_ENDPOINT, apiKey, {
      part: 'contentDetails',
      playlistId: uploadsPlaylistId,
      maxResults: String(Math.min(max, RESULTS_PER_PAGE)),
    }),
    'Failed to load channel uploads.',
    { units: COST.playlistItems },
  )

  const ids = (playlistData.items ?? [])
    .map((item) => item.contentDetails?.videoId)
    .filter((id): id is string => Boolean(id))

  const { items } = await fetchVideosByIds(apiKey, ids)
  return items
}

/**
 * The most-popular chart — 1 unit. Optionally scoped to a category, which makes
 * category browsing 100× cheaper than running a search for the same thing.
 */
export async function fetchMostPopular(
  apiKey: string,
  options: { regionCode?: string; videoCategoryId?: string; pageToken?: string } = {},
): Promise<{ items: VideoResult[]; filteredOut: number; nextPageToken: string | null }> {
  const data = await call<{ items?: RawVideo[]; nextPageToken?: string }>(
    endpoint(VIDEOS_ENDPOINT, apiKey, {
      part: 'contentDetails,snippet,statistics',
      chart: 'mostPopular',
      regionCode: options.regionCode ?? 'US',
      videoCategoryId: options.videoCategoryId,
      pageToken: options.pageToken,
      maxResults: String(RESULTS_PER_PAGE),
    }),
    'Failed to load popular videos.',
    { units: COST.videos },
  )

  const { items, filteredOut } = filterVideos(data.items ?? [])

  return { items, filteredOut, nextPageToken: data.nextPageToken ?? null }
}

type Subscription = {
  snippet?: { resourceId?: { channelId?: string }; title?: string }
}

/**
 * The signed-in user's subscriptions — **1 unit**, versus the 100 a search costs.
 * This is the whole economic argument for linking an account.
 */
export async function fetchSubscriptions(
  apiKey: string,
  accessToken: string,
  max = 50,
): Promise<Array<{ channelId: string; title: string }>> {
  const data = await call<{ items?: Subscription[] }>(
    endpoint(SUBSCRIPTIONS_ENDPOINT, apiKey, {
      part: 'snippet',
      mine: 'true',
      // Most-recently-active first is a better feed signal than alphabetical.
      order: 'relevance',
      maxResults: String(Math.min(max, RESULTS_PER_PAGE)),
    }),
    'Failed to load your subscriptions.',
    { units: 1, accessToken },
  )

  return (data.items ?? [])
    .map((item) => ({
      channelId: item.snippet?.resourceId?.channelId ?? '',
      title: decodeHtmlEntities(item.snippet?.title ?? 'Unknown channel'),
    }))
    .filter((item) => item.channelId)
}

/**
 * Recent uploads across several channels, batched.
 *
 * channels.list accepts up to 50 ids in one 1-unit call, so resolving every
 * uploads playlist costs 1 unit total rather than 1 per channel. Only the
 * per-channel playlistItems calls scale, at 1 unit each.
 */
export async function fetchUploadsForChannels(
  apiKey: string,
  channelIds: string[],
  perChannel = 10,
): Promise<VideoResult[]> {
  if (channelIds.length === 0) return []

  const ids = channelIds.slice(0, RESULTS_PER_PAGE)

  const channelData = await call<{
    items?: Array<{ id: string; contentDetails?: { relatedPlaylists?: { uploads?: string } } }>
  }>(
    endpoint(CHANNELS_ENDPOINT, apiKey, { part: 'contentDetails', id: ids.join(',') }),
    'Failed to load channels.',
    { units: COST.channels },
  )

  const playlists = (channelData.items ?? [])
    .map((item) => item.contentDetails?.relatedPlaylists?.uploads)
    .filter((id): id is string => Boolean(id))

  const perPlaylist = await Promise.all(
    playlists.map(async (playlistId) => {
      try {
        const data = await call<{ items?: Array<{ contentDetails?: { videoId?: string } }> }>(
          endpoint(PLAYLIST_ITEMS_ENDPOINT, apiKey, {
            part: 'contentDetails',
            playlistId,
            maxResults: String(perChannel),
          }),
          'Failed to load uploads.',
          { units: COST.playlistItems },
        )

        return (data.items ?? [])
          .map((item) => item.contentDetails?.videoId)
          .filter((id): id is string => Boolean(id))
      } catch {
        // One dead playlist shouldn't sink the whole feed.
        return []
      }
    }),
  )

  // One batched videos.list for durations and stats, regardless of channel count.
  const videoIds = [...new Set(perPlaylist.flat())].slice(0, RESULTS_PER_PAGE)
  const { items } = await fetchVideosByIds(apiKey, videoIds)

  return items
}
