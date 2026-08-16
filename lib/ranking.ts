/**
 * Ranks featured candidates against the local taste profile.
 *
 * Pure functions, no I/O — the whole thing is testable in isolation, which
 * matters because ranking bugs are otherwise invisible (you just get a slightly
 * worse feed and never know).
 */

import { clickbaitScore, isBlocked, matchInterests, type Interest } from '@/lib/interests'
import { tokenize, type Seed, type TasteProfile } from '@/lib/taste-profile'
import type { VideoResult } from '@/lib/youtube'


/** Clickbait at or above this is dropped outright rather than demoted. */
export const CLICKBAIT_REJECT = 0.45

/**
 * How much of the score each signal can contribute.
 *
 * Split into two groups that combine *multiplicatively*, which is the whole point.
 * `relevance` is why this video is for you; `quality` is how good a specimen it is.
 * Adding them let virality stand in for relevance — measured, a
 * "I bought a $1,000,000 car" with 40M views scored 0.24 on popularity, freshness
 * and velocity alone and outranked a genuinely on-topic video with 25k views. No
 * amount of view count should make an unrelated video a recommendation, so quality
 * now only ever *scales* relevance and can never manufacture it.
 */
export const WEIGHTS = {
  /** Declared topics — the largest single term, so the feed stays on subject. */
  interest: 0.35,
  /** Learned from what you actually watch and search. */
  topic: 0.2,
  channel: 0.2,
  /**
   * How much the seed itself vouches for the video.
   *
   * A channel you follow or subscribe to is a decision you made, so anything it
   * uploads is relevant by construction. A broad topic query is a guess, so its
   * results have to earn their place on the other signals. Without this the two
   * were indistinguishable, and a query seed's viral filler ranked alongside an
   * upload from a channel you deliberately followed.
   */
  seed: 0.15,
  popularity: 0.08,
  freshness: 0.07,
  velocity: 0.1,
} as const

/**
 * How far each kind of seed vouches for what it returned. See WEIGHTS.seed.
 *
 * The query figure is deliberately low but not zero: a topic query does establish
 * subject, so its results start above nothing — this is what keeps a well-titled
 * video with no matching keyword ("Why does every mammal get 1 billion
 * heartbeats?") in the running rather than scoring a flat zero.
 */
export const SEED_TRUST: Record<Seed['type'], number> = {
  subscriptions: 1,
  channel: 1,
  query: 0.3,
}

/** How hard clickbait styling is punished. Enough to sink an otherwise strong match. */
export const CLICKBAIT_WEIGHT = 0.4

/** Each extra video from an already-picked channel is multiplied by this. */
export const DIVERSITY_DECAY = 0.55

export type ScoredVideo = {
  video: VideoResult
  score: number
  /** Why this surfaced, shown on the card. */
  reason: string
  parts: {
    interest: number
    topic: number
    channel: number
    /** How far the seed this arrived from vouches for it. */
    seed: number
    popularity: number
    freshness: number
    velocity: number
    clickbait: number
  }
}

/**
 * Overlap between a title and the profile's interests.
 *
 * Divided by sqrt(token count) rather than the raw count: long clickbait titles
 * would otherwise either dominate (raw sum) or be unfairly flattened (mean).
 */
export function topicScore(title: string, profile: TasteProfile): number {
  const tokens = tokenize(title)
  if (tokens.length === 0) return 0

  let sum = 0
  for (const token of tokens) sum += profile.terms.get(token) ?? 0

  return Math.min(1, sum / Math.sqrt(tokens.length))
}

/** log10 of views, mapped so 1k -> 0 and 100M -> 1. */
export function popularityScore(viewCount: number | null): number {
  if (!viewCount || viewCount <= 0) return 0

  const normalised = (Math.log10(viewCount) - 3) / 5
  return Math.min(1, Math.max(0, normalised))
}

/** Decays over ~6 months, so the feed leans recent without banning back catalogue. */
export function freshnessScore(publishedAt: string, now: number): number {
  const published = new Date(publishedAt).getTime()
  if (Number.isNaN(published)) return 0

  const ageDays = Math.max(0, (now - published) / 86400000)
  return 0.5 ** (ageDays / 180)
}

/**
 * Views per day, log-scaled. This is what separates a video that's genuinely
 * taking off from one that merely accumulated views over a decade.
 */
export function velocityScore(viewCount: number | null, publishedAt: string, now: number): number {
  if (!viewCount || viewCount <= 0) return 0

  const published = new Date(publishedAt).getTime()
  if (Number.isNaN(published)) return 0

  const ageDays = Math.max(1, (now - published) / 86400000)
  const perDay = viewCount / ageDays

  // 10/day -> 0, 1M/day -> 1
  return Math.min(1, Math.max(0, (Math.log10(perDay) - 1) / 5))
}

export function scoreVideo(
  video: VideoResult,
  profile: TasteProfile,
  seed: Seed,
  now: number,
  interests: Interest[],
): ScoredVideo {
  const match = matchInterests(video.title, video.description, interests)

  const parts = {
    interest: match.score,
    topic: topicScore(video.title, profile),
    channel: profile.channels.get(video.channelId) ?? 0,
    seed: SEED_TRUST[seed.type] ?? SEED_TRUST.query,
    popularity: popularityScore(video.viewCount),
    freshness: freshnessScore(video.publishedAt, now),
    velocity: velocityScore(video.viewCount, video.publishedAt, now),
    clickbait: clickbaitScore(video.title),
  }

  /** Why this video is for you. Zero here should mean zero overall. */
  const relevance =
    WEIGHTS.interest * parts.interest +
    WEIGHTS.topic * parts.topic +
    WEIGHTS.channel * parts.channel +
    WEIGHTS.seed * parts.seed

  /** How good a specimen it is. A modifier on relevance, never a substitute. */
  const quality =
    WEIGHTS.popularity * parts.popularity +
    WEIGHTS.freshness * parts.freshness +
    WEIGHTS.velocity * parts.velocity

  // Multiplicative, so quality can lift a relevant video by at most a quarter and
  // can do nothing whatever for an irrelevant one. Clickbait is subtracted after,
  // so a loud title costs the same wherever it appears.
  const score = relevance * (1 + quality) - CLICKBAIT_WEIGHT * parts.clickbait

  // Name the topic that matched rather than the seed, when we know it — "Volleyball"
  // is a more useful explanation than "Because you searched …".
  const reason = match.labels.length > 0 ? match.labels.slice(0, 2).join(' · ') : seed.label

  return { video, score: Math.max(0, score), reason, parts }
}

/**
 * Greedy selection with a per-channel penalty (a simplified MMR).
 *
 * Without this, one prolific channel wins the top ten outright — mathematically
 * correct, useless as a feed. Re-sorting after each pick is O(n²) but n is a few
 * hundred at most.
 */
export function rankWithDiversity(candidates: ScoredVideo[], limit: number): ScoredVideo[] {
  const remaining = [...candidates]
  const picked: ScoredVideo[] = []
  const channelCounts = new Map<string, number>()

  while (picked.length < limit && remaining.length > 0) {
    let bestIndex = 0
    let bestAdjusted = -Infinity

    for (let index = 0; index < remaining.length; index += 1) {
      const entry = remaining[index]
      const seen = channelCounts.get(entry.video.channelId) ?? 0
      const adjusted = entry.score * DIVERSITY_DECAY ** seen

      if (adjusted > bestAdjusted) {
        bestAdjusted = adjusted
        bestIndex = index
      }
    }

    const [chosen] = remaining.splice(bestIndex, 1)
    picked.push(chosen)
    channelCounts.set(chosen.video.channelId, (channelCounts.get(chosen.video.channelId) ?? 0) + 1)
  }

  return picked
}

/**
 * Reorders an explicitly browsed list — a category chip — by how well it matches
 * your own taste, instead of leaving it in YouTube's generic chart order.
 *
 * Distinct from buildFeed in what it is allowed to throw away, and that difference
 * is the point. The home feed is *curated*: it decides what to show you, so it
 * gates hard. Here you asked for this category by name, so this only ever
 * **reorders**, with two exceptions:
 *
 *  - the blocklist, which is a standing "never show me this" and applies everywhere
 *  - videos you've already watched or saved, which sink to the end rather than
 *    vanishing, so the count you were given is the count you get
 *
 * Clickbait isn't dropped either, only penalised — scoreVideo already subtracts for
 * it, and in a category you chose, a loud title is a demotion, not a disqualifier.
 *
 * Pure and free: no API call, no quota. Applied per page as it arrives rather than
 * over the whole accumulated list, so "Load more" appends instead of reshuffling
 * what you're already looking at.
 */
export function rankForBrowse(
  items: VideoResult[],
  profile: TasteProfile,
  interests: Interest[],
  now = Date.now(),
): VideoResult[] {
  /** scoreVideo wants a seed for its fallback reason, which is unused here. */
  const seed: Seed = { type: 'query', value: '', label: '' }

  const fresh: ScoredVideo[] = []
  const seen: ScoredVideo[] = []

  for (const video of items) {
    if (isBlocked(video.title)) continue

    const scored = scoreVideo(video, profile, seed, now, interests)
    if (profile.knownIds.has(video.id)) seen.push(scored)
    else fresh.push(scored)
  }

  fresh.sort((a, b) => b.score - a.score)
  seen.sort((a, b) => b.score - a.score)

  // Diversity within each half separately, so the unwatched videos get the full
  // per-channel spread among themselves rather than competing with repeats for it.
  return [
    ...rankWithDiversity(fresh, fresh.length),
    ...rankWithDiversity(seen, seen.length),
  ].map((entry) => entry.video)
}

export type SeedGroup = { seed: Seed; items: VideoResult[] }

/**
 * The point below which a feed reads as broken rather than selective.
 *
 * Under this fraction of what was asked for, buildFeed goes back for the videos it
 * set aside rather than handing back a mostly-empty grid. A short feed is a worse
 * failure than an imperfect one: you can scroll past a mediocre video, but there
 * is nothing to do with a blank screen.
 */
export const TOPUP_THRESHOLD = 0.5

/**
 * Full pipeline: gate, dedupe, drop anything already seen, score, then diversify.
 *
 * The gate is what makes this a curated feed rather than a ranked one. Scoring
 * alone would let junk through whenever it happened to be popular and fresh —
 * so anything blocked, or entirely off-topic, is removed before scoring rather
 * than merely ranked below.
 *
 * Two passes, though. The strict pass drops the already-watched and the clickbait;
 * if that leaves less than TOPUP_THRESHOLD of the requested size, the second pass
 * puts them back, worst last, until the feed is a reasonable length. The gates
 * compound harder than they look — a thin pool that is mostly already watched
 * measured six candidates in and one out — and an empty feed is not a stricter
 * feed, it is a broken one.
 *
 * The blocklist is the one thing never restored. That is a standing instruction
 * about subject matter rather than a quality heuristic, so running short is not a
 * reason to override it.
 *
 * `alreadyShown` holds ids the feed has already put on screen. They are demoted
 * to the back rather than dropped, which is what lets Refresh surface new videos
 * from an unchanged candidate set — the case for a linked account, where
 * `subscriptions` returns the same recent uploads however many times you ask.
 */
export function buildFeed(
  groups: SeedGroup[],
  profile: TasteProfile,
  interests: Interest[],
  limit = 24,
  now = Date.now(),
  alreadyShown: ReadonlySet<string> = new Set(),
): ScoredVideo[] {
  const bestPerVideo = new Map<string, ScoredVideo>()

  /** Set aside by a soft gate, and brought back only if the feed runs short. */
  const setAside = new Map<string, ScoredVideo>()

  const keepBest = (into: Map<string, ScoredVideo>, scored: ScoredVideo) => {
    const existing = into.get(scored.video.id)
    // A video can surface from several seeds; keep the best-scoring reason.
    if (!existing || scored.score > existing.score) into.set(scored.video.id, scored)
  }

  for (const group of groups) {
    for (const video of group.items) {
      // Hard block: reaction bait, drama, true crime, gambling, brainrot, kids TV.
      // Never reconsidered, however short the feed gets.
      if (isBlocked(video.title)) continue

      const scored = scoreVideo(video, profile, group.seed, now, interests)

      // Soft gate: already watched or saved. Recommending it again is pointless
      // unless the alternative is showing you nothing.
      if (profile.knownIds.has(video.id)) {
        keepBest(setAside, scored)
        continue
      }

      // Soft gate: screaming clickbait isn't what "good for the brain" means.
      if (scored.parts.clickbait >= CLICKBAIT_REJECT) {
        keepBest(setAside, scored)
        continue
      }

      /*
       * Note there is deliberately no "title must contain a topic keyword" gate.
       * It was tried and it failed badly on real data: candidates already arrive
       * from topic-targeted seeds, so they're on-subject by construction, while
       * good titles are phrased as natural questions — "Why does every mammal get
       * 1 billion heartbeats?" contains no biology keyword at all and was being
       * thrown away, leaving eight near-identical episodes that happened to say
       * "Geology". Topicality is established by the seed; keyword matching is a
       * ranking boost via WEIGHTS.interest, not an entry requirement.
       */

      keepBest(bestPerVideo, scored)
    }
  }

  /*
   * Top up from the set-aside pile when the strict pass came back too thin. Sorted
   * worst-last within itself and appended after everything that passed cleanly, so
   * the compromise is always at the bottom of the feed rather than mixed through it.
   */
  if (bestPerVideo.size < limit * TOPUP_THRESHOLD) {
    const spare = [...setAside.values()]
      .filter((entry) => !bestPerVideo.has(entry.video.id))
      .sort((a, b) => b.score - a.score)

    for (const entry of spare) {
      if (bestPerVideo.size >= limit) break
      bestPerVideo.set(entry.video.id, entry)
    }
  }

  const sorted = [...bestPerVideo.values()].sort((a, b) => b.score - a.score)

  if (alreadyShown.size === 0) return rankWithDiversity(sorted, limit)

  /*
   * Diversity is applied within each half separately, so the videos you haven't
   * seen get the full per-channel spread among themselves rather than competing
   * with repeats for it.
   */
  const fresh = rankWithDiversity(
    sorted.filter((entry) => !alreadyShown.has(entry.video.id)),
    limit,
  )

  if (fresh.length >= limit) return fresh

  const repeats = rankWithDiversity(
    sorted.filter((entry) => alreadyShown.has(entry.video.id)),
    limit - fresh.length,
  )

  return [...fresh, ...repeats]
}
