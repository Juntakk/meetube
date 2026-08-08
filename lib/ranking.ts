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
export const CLICKBAIT_REJECT = 0.55

/** Contributions sum to 1.0 before penalties. */
export const WEIGHTS = {
  /** Declared topics — the largest single term, so the feed stays on subject. */
  interest: 0.35,
  /** Learned from what you actually watch and search. */
  topic: 0.2,
  channel: 0.2,
  popularity: 0.08,
  freshness: 0.07,
  velocity: 0.1,
} as const

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
    popularity: popularityScore(video.viewCount),
    freshness: freshnessScore(video.publishedAt, now),
    velocity: velocityScore(video.viewCount, video.publishedAt, now),
    clickbait: clickbaitScore(video.title),
  }

  const score =
    WEIGHTS.interest * parts.interest +
    WEIGHTS.topic * parts.topic +
    WEIGHTS.channel * parts.channel +
    WEIGHTS.popularity * parts.popularity +
    WEIGHTS.freshness * parts.freshness +
    WEIGHTS.velocity * parts.velocity -
    CLICKBAIT_WEIGHT * parts.clickbait

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

export type SeedGroup = { seed: Seed; items: VideoResult[] }

/**
 * Full pipeline: gate, dedupe, drop anything already seen, score, then diversify.
 *
 * The gate is what makes this a curated feed rather than a ranked one. Scoring
 * alone would let junk through whenever it happened to be popular and fresh —
 * so anything blocked, or entirely off-topic, is removed before scoring rather
 * than merely ranked below.
 */
export function buildFeed(
  groups: SeedGroup[],
  profile: TasteProfile,
  interests: Interest[],
  limit = 24,
  now = Date.now(),
): ScoredVideo[] {
  const bestPerVideo = new Map<string, ScoredVideo>()

  for (const group of groups) {
    for (const video of group.items) {
      // Never recommend something already watched or saved.
      if (profile.knownIds.has(video.id)) continue

      // Hard block: reaction bait, drama, true crime, gambling, brainrot, kids TV.
      if (isBlocked(video.title)) continue

      const scored = scoreVideo(video, profile, group.seed, now, interests)

      // Screaming clickbait isn't what "good for the brain" means, even on-topic.
      if (scored.parts.clickbait >= CLICKBAIT_REJECT) continue

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

      const existing = bestPerVideo.get(video.id)

      // A video can surface from several seeds; keep the best-scoring reason.
      if (!existing || scored.score > existing.score) {
        bestPerVideo.set(video.id, scored)
      }
    }
  }

  const sorted = [...bestPerVideo.values()].sort((a, b) => b.score - a.score)

  return rankWithDiversity(sorted, limit)
}
