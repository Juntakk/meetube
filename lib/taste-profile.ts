/**
 * Turns local activity into a taste profile, and picks which queries to fetch.
 *
 * Everything here is pure so it can be tested without a browser or the API. The
 * profile itself never leaves the device — only the chosen seed terms are sent
 * to /api/featured, which is the minimum the server needs to fetch anything.
 */

import { matchInterests, type Interest } from '@/lib/interests'
import type { WatchEntry } from '@/lib/watch-history'
import type { VideoResult } from '@/lib/youtube'

/** Interest halves every two weeks, so the feed follows what you're into now. */
export const HALF_LIFE_DAYS = 14

/*
 * Relative trust in each signal. Opening a video is a much stronger statement
 * than typing a search, and saving sits between the two.
 */
export const SIGNAL_WEIGHTS = {
  watch: 3,
  save: 2,
  search: 1.5,
} as const

const STOPWORDS = new Set([
  'the','a','an','and','or','but','if','of','at','by','for','with','about','to','from','in','on',
  'is','are','was','were','be','been','being','it','its','this','that','these','those','as','how',
  'what','why','when','where','who','which','you','your','i','me','my','we','our','they','them',
  'he','she','his','her','do','does','did','can','will','just','not','no','vs','ep','pt','part',
  'video','videos','official','full','hd','4k','new','best','top','review','tutorial','guide',
  'watch','free','online','episode','season','live','ft','feat','remix','trailer','shorts',
])

/** Lowercases, strips punctuation/emoji, drops stopwords and 1-character noise. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && token.length < 24 && !STOPWORDS.has(token) && !/^\d+$/.test(token))
}

/** 1.0 for something that just happened, 0.5 after one half-life, and so on. */
export function decay(timestamp: number, now: number): number {
  const ageDays = Math.max(0, (now - timestamp) / 86400000)
  return 0.5 ** (ageDays / HALF_LIFE_DAYS)
}

export type TasteProfile = {
  /** token -> weight, normalised so the strongest interest is 1. */
  terms: Map<string, number>
  /** channelId -> weight, normalised the same way. */
  channels: Map<string, number>
  channelNames: Map<string, string>
  /** Videos already watched or saved; excluded from the feed. */
  knownIds: Set<string>
  /** True when there isn't enough history to personalise anything. */
  isEmpty: boolean
}

export type ProfileInput = {
  history: WatchEntry[]
  saved: VideoResult[]
  /** Most recent first, as stored. Timestamps aren't kept, so position stands in for age. */
  searches: string[]
  now?: number
}

function bump(map: Map<string, number>, key: string, amount: number) {
  if (!key) return
  map.set(key, (map.get(key) ?? 0) + amount)
}

function normalise(map: Map<string, number>): Map<string, number> {
  let max = 0
  for (const value of map.values()) max = Math.max(max, value)
  if (max === 0) return map

  const out = new Map<string, number>()
  for (const [key, value] of map) out.set(key, value / max)
  return out
}

export function buildProfile({ history, saved, searches, now = Date.now() }: ProfileInput): TasteProfile {
  const terms = new Map<string, number>()
  const channels = new Map<string, number>()
  const channelNames = new Map<string, string>()
  const knownIds = new Set<string>()

  for (const entry of history) {
    const weight = SIGNAL_WEIGHTS.watch * decay(entry.at, now)
    knownIds.add(entry.id)

    for (const token of tokenize(entry.title)) bump(terms, token, weight)

    bump(channels, entry.channelId, weight)
    if (entry.channelId) channelNames.set(entry.channelId, entry.channelTitle)
  }

  // Saved videos carry no timestamp, so position stands in: the list is newest
  // first, and each step back counts as roughly a day older.
  saved.forEach((video, index) => {
    const weight = SIGNAL_WEIGHTS.save * decay(now - index * 86400000, now)
    knownIds.add(video.id)

    for (const token of tokenize(video.title)) bump(terms, token, weight)

    bump(channels, video.channelId, weight)
    if (video.channelId) channelNames.set(video.channelId, video.channelTitle)
  })

  searches.forEach((query, index) => {
    const weight = SIGNAL_WEIGHTS.search * decay(now - index * 86400000, now)
    for (const token of tokenize(query)) bump(terms, token, weight)
  })

  return {
    terms: normalise(terms),
    channels: normalise(channels),
    channelNames,
    knownIds,
    isEmpty: terms.size === 0 && channels.size === 0,
  }
}

export type Seed =
  | { type: 'query'; value: string; label: string }
  | { type: 'channel'; value: string; label: string }

/*
 * Seed budget. Channel seeds are nearly free (3 units via the uploads playlist)
 * while query seeds cost 101, so we lean on channels and spend on at most two
 * searches per refresh.
 */
const MAX_CHANNEL_SEEDS = 2
const MAX_QUERY_SEEDS = 2

/**
 * Chooses what to fetch.
 *
 * There is deliberately no trending/mostPopular fallback. An empty profile used
 * to fall back to YouTube's chart, which is the exact content this app exists to
 * filter out — so with no history we seed from the declared topics instead, and
 * the feed is on-subject from the very first launch.
 *
 * Interest queries rotate by day so the feed doesn't calcify into the same three
 * searches forever, and rotation is derived from `now` rather than randomness so
 * a re-render doesn't reshuffle mid-session.
 */
export function pickSeeds(
  profile: TasteProfile,
  searches: string[],
  interests: Interest[],
  now = Date.now(),
): Seed[] {
  const seeds: Seed[] = []

  // 1. Channels you already watch — cheapest signal, and already self-selected.
  const topChannels = [...profile.channels.entries()]
    .filter(([id]) => id)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CHANNEL_SEEDS)

  for (const [channelId] of topChannels) {
    seeds.push({
      type: 'channel',
      value: channelId,
      label: `More from ${profile.channelNames.get(channelId) ?? 'a channel you watch'}`,
    })
  }

  const querySlots = MAX_QUERY_SEEDS

  /*
   * 2. Your own recent searches, but only the on-topic ones. Searching for
   *    something off-subject shouldn't drag the feed off-subject with it.
   */
  const onTopicSearches = searches.filter(
    (query) => matchInterests(query, '', interests).score > 0,
  )

  /*
   * 3. Rotating interest queries fill the rest.
   *
   * Built round-robin across topics rather than topic-by-topic: a flat concat
   * puts each topic's queries next to each other, so taking consecutive entries
   * would hand you two Sport queries one day and two History queries the next.
   * Interleaving guarantees adjacent picks come from different topics.
   */
  const deepest = Math.max(0, ...interests.map((interest) => interest.queries.length))

  const pool: Array<{ query: string; label: string }> = []
  for (let depth = 0; depth < deepest; depth += 1) {
    for (const interest of interests) {
      const query = interest.queries[depth]
      if (query) pool.push({ query, label: interest.label })
    }
  }

  const dayIndex = Math.floor(now / 86400000)

  const interestSeeds: Seed[] = []
  for (let i = 0; i < pool.length && interestSeeds.length < querySlots; i += 1) {
    const entry = pool[(dayIndex + i) % pool.length]
    interestSeeds.push({
      type: 'query',
      value: entry.query,
      label: entry.label,
    })
  }

  // Give a recent on-topic search one slot, so learning stays visible.
  if (onTopicSearches.length > 0 && querySlots > 0) {
    seeds.push({
      type: 'query',
      value: onTopicSearches[0],
      label: `Because you searched “${onTopicSearches[0]}”`,
    })
    seeds.push(...interestSeeds.slice(0, querySlots - 1))
  } else {
    seeds.push(...interestSeeds.slice(0, querySlots))
  }

  return seeds
}
