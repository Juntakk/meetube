import { NextResponse } from 'next/server'

import { getCategory, isValidCategory } from '@/lib/categories'
import { readSearchLocale, type SearchLocale } from '@/lib/locale'
import { getQuota } from '@/lib/quota'
import { parseFilters, uploadedToPublishedAfter } from '@/lib/filters'
import {
  fetchMostPopular,
  fetchVideosByIds,
  searchVideoIds,
  YouTubeApiError,
} from '@/lib/youtube-server'
import type { SearchResponse } from '@/lib/youtube'

export const runtime = 'nodejs'
// Search results depend entirely on the query string, so there is nothing to prerender.
export const dynamic = 'force-dynamic'

/**
 * Below this many usable videos, the chart isn't worth showing and we pay for a
 * search instead.
 */
const MIN_CHART_ITEMS = 8

/**
 * Category browsing, cheapest-first.
 *
 * `chart=mostPopular&videoCategoryId=…` costs 1 unit and works well for Gaming,
 * News, Music and People & Blogs. But trending in Comedy and Entertainment is
 * ~99% Shorts (measured: 198 of 200), and Education and Travel aren't valid
 * chart categories at all (404). For those we fall back to a search on the
 * category's own name — 101 units, but it actually returns long-form video.
 *
 * Page tokens are prefixed so the follow-up page continues on the same source;
 * chart and search tokens are not interchangeable.
 */
async function browseCategory(
  apiKey: string,
  categoryId: string,
  pageToken: string | undefined,
  locale: SearchLocale,
) {
  const source = pageToken?.startsWith('s:') ? 'search' : pageToken?.startsWith('c:') ? 'chart' : 'auto'
  const rawToken = pageToken && source !== 'auto' ? pageToken.slice(2) : undefined

  // Validated by the caller, so this is never null in practice.
  const category = getCategory(categoryId)

  /*
   * Topic chips have no YouTube category behind them, so there is no chart to try
   * and attempting one would 404 after a round trip. Skip straight to the search.
   */
  if (source !== 'search' && category?.videoCategoryId) {
    try {
      const chart = await fetchMostPopular(apiKey, {
        videoCategoryId: category.videoCategoryId,
        pageToken: rawToken,
        regionCode: locale.regionCode,
      })

      // Once committed to the chart, stay on it — otherwise paging would jump
      // sources and start repeating videos.
      if (source === 'chart' || chart.items.length >= MIN_CHART_ITEMS) {
        return NextResponse.json<SearchResponse>({
          items: chart.items,
          filteredOut: chart.filteredOut,
          nextPageToken: chart.nextPageToken ? `c:${chart.nextPageToken}` : null,
          quota: await getQuota(),
        })
      }
    } catch (error) {
      // A category the chart doesn't support 404s; anything else is a real error.
      if (!(error instanceof YouTubeApiError) || error.status !== 404) throw error
    }
  }

  /*
   * A topic chip's own query, or the category's label for a chart category whose
   * chart wasn't usable. The category id is still passed when there is one: it
   * narrows the search meaningfully and costs nothing extra.
   */
  const { ids, nextPageToken } = await searchVideoIds(apiKey, {
    q: category?.query ?? category?.label ?? '',
    videoCategoryId: category?.videoCategoryId,
    order: 'viewCount',
    pageToken: rawToken,
    ...locale,
  })

  const { items, filteredOut } = await fetchVideosByIds(apiKey, ids)

  return NextResponse.json<SearchResponse>({
    items,
    filteredOut,
    nextPageToken: nextPageToken ? `s:${nextPageToken}` : null,
    quota: await getQuota(),
  })
}

export async function GET(request: Request) {
  const apiKey = process.env.YOUTUBE_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      { error: 'YOUTUBE_API_KEY is not set. Copy .env.local.example to .env.local and add your key.' },
      { status: 500 },
    )
  }

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.trim()
  const channelId = searchParams.get('channel')?.trim()
  const pageToken = searchParams.get('pageToken')?.trim()
  const rawCategory = searchParams.get('category')?.trim()
  const filters = parseFilters(searchParams)
  const locale = readSearchLocale(request.headers)

  // Reject unknown ids rather than forwarding them to YouTube.
  const category = isValidCategory(rawCategory) ? rawCategory : undefined

  // Browsing a channel or a category needs no query text; a plain search does.
  if (!query && !channelId && !category) {
    return NextResponse.json({ error: 'Missing search query.' }, { status: 400 })
  }

  try {
    if (category && !query && !channelId) {
      return await browseCategory(apiKey, category, pageToken, locale)
    }

    /*
     * "Relevance" is meaningless with no query to be relevant to, so browsing a
     * channel falls back to newest-first — which is what YouTube's own channel
     * Videos tab leads with. Any explicit sort still wins.
     */
    const order =
      filters.sort !== 'relevance' ? filters.sort : channelId && !query ? 'date' : undefined

    const { ids, nextPageToken } = await searchVideoIds(apiKey, {
      q: query,
      channelId,
      pageToken,
      order,
      ...locale,
      publishedAfter: uploadedToPublishedAfter(filters.uploaded) ?? undefined,
      videoDuration: filters.length !== 'any' ? filters.length : undefined,
      videoCategoryId: category,
    })

    if (ids.length === 0) {
      return NextResponse.json<SearchResponse>({ items: [], nextPageToken, filteredOut: 0, quota: await getQuota() })
    }

    const { items, filteredOut } = await fetchVideosByIds(apiKey, ids)

    return NextResponse.json<SearchResponse>({ items, nextPageToken, filteredOut, quota: await getQuota() })
  } catch (error) {
    if (error instanceof YouTubeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error('[api/search]', error)
    return NextResponse.json(
      { error: 'Could not reach YouTube. Check your connection and try again.' },
      { status: 502 },
    )
  }
}
