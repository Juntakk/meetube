/**
 * The fixed set of channels the home feed is built from.
 *
 * No recommendation engine, no watch-history inference, no search — just these
 * channels' own uploads, shuffled. Ids were resolved once via
 * scripts/resolve-channels.mjs (channels.list?forHandle, 1 unit each) rather
 * than a 100-unit search.list per channel.
 *
 * This is the curated base layer. On top of it, /api/feed also merges in
 * whichever channels you've followed from a channel page (lib/followed-channels.ts)
 * — so the feed isn't limited to a code change and a redeploy the way this list is.
 *
 * Both the server (the feed route) and the client (cache keying, the side
 * rail) import this, so it has to stay free of secrets and Node-only APIs —
 * same rule as lib/youtube.ts.
 */

export type FeedChannel = {
  /** The UC… id, what every YouTube Data API call actually needs. */
  id: string
  title: string
  /** For display and for a link to the channel's own page. */
  handle: string
}

/**
 * In the order requested. No longer load-bearing for the feed itself — it
 * shuffles — but it's what the side rail's channel shortcuts use, and it's the
 * order a human reading this file expects.
 *
 * To add a channel: resolve its id with `node scripts/resolve-channels.mjs`
 * and append it here. Nothing else needs to change — the feed route reads
 * this list directly, and the client cache key is derived from it.
 */
export const FEED_CHANNELS: FeedChannel[] = [
  { id: 'UCwzCMiicL-hBUzyjWiJaseg', title: 'Kill Tony', handle: '@killtony' },
  { id: 'UCu7ODDeIZ4x1rJwM1LCVL8w', title: 'Thebausffs', handle: '@thebausffs' },
  { id: 'UCa6vGFO9ty8v5KZJXQxdhaw', title: 'Jimmy Kimmel Live', handle: '@jimmykimmellive' },
  { id: 'UC0aFOAetT4Hur0qmOnmmbBA', title: 'Polypuff', handle: '@polypuff' },
  { id: 'UCwI-JbGNsojunnHbFAc0M4Q', title: 'ARTE', handle: '@arte' },
  { id: 'UCHQUWveEpeO1KTkwbDn6jNA', title: 'Beach Volleyball World', handle: '@beachvolleyballworld' },
  { id: 'UCD5-eRiWjgPUje8YGKfAbOg', title: 'AVP Beach Volleyball', handle: '@avpbeach' },
  { id: 'UCCsREoj8rSRkEvxWqxr74rQ', title: 'Cybernews', handle: '@cybernews' },
  { id: 'UC477Kvszl9JivqOxN1dFgPQ', title: 'Iron Pineapple', handle: '@ironpineapple' },
  { id: 'UCQJT7rpynlR7SSdn3OyuI_Q', title: 'Loleventvods', handle: '@eventvods' },
  { id: 'UCVw8WSz1c_cazwOA0Yk_P_w', title: 'Synapse', handle: '@synapse1' },
  { id: 'UC0fo9HHpem4S07dzdwSVXnw', title: 'Sport Arena Network', handle: '@sportarenanetwork' },
  { id: 'UCUyeluBRhGPCW4rPe_UvBZQ', title: 'The PrimeTime', handle: '@theprimetimeagen' },
  { id: 'UCHQda5vLxrH0Ff0I0kMq4zw', title: 'Konbini', handle: '@konbini' },
  { id: 'UCsT0YIqwnpJCM-mx7-gSA4Q', title: 'TEDx Talks', handle: '@tedx' },
  { id: 'UCKy1dAqELo0zrOtPkf0eTMw', title: 'IGN', handle: '@ign' },
]

/**
 * How many of each channel's most recent uploads go into the shuffle bag.
 *
 * 10 per channel × 16 channels ≈ 160 candidates before any followed channels
 * are added. Deep enough that a channel posting a few times a week still has
 * several videos in the pool, shallow enough that a channel posting many
 * times a day (IGN, Cybernews) can't fill the bag on its own — it gets the
 * same 10 slots as everyone else.
 */
export const UPLOADS_PER_CHANNEL = 10

/** The shape of a real YouTube channel id — everything else is rejected. */
const CHANNEL_ID_PATTERN = /^UC[\w-]{22}$/

export function isValidChannelId(id: string): boolean {
  return CHANNEL_ID_PATTERN.test(id)
}

/**
 * Ceiling on how many followed channels /api/feed will merge in on top of
 * FEED_CHANNELS.
 *
 * Followed channels are nearly free individually (2 units each) but the
 * follow list itself is unbounded from the server's point of view — this is
 * what stops one enormous follow list from turning a refresh into hundreds of
 * units. Well above what anyone follows by hand; see MAX_FOLLOWED in
 * lib/followed-channels.ts for the client-side list's own, larger cap.
 */
export const MAX_EXTRA_FEED_CHANNELS = 30

/**
 * Fisher–Yates shuffle. Does not mutate its input.
 *
 * Applied client-side, in components/channel-feed.tsx, over the newest-first
 * order /api/feed returns — so switching between "Shuffled" and "Newest"
 * is a pure re-render, not a second fetch.
 *
 * `random` is injectable so this is testable without depending on `Math.random`
 * — pass a seeded generator in a test and the permutation is reproducible.
 */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items]

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }

  return result
}
