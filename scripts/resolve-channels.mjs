/**
 * Resolves the feed's channel names to UC… ids, printing a paste-ready array.
 *
 * One-off tooling, not part of the app: run it when adding channels to
 * lib/channel-feed.ts, then paste the output in.
 *
 * Every lookup goes through `channels.list?forHandle` at **1 unit**. There is
 * deliberately no search.list fallback — that costs 100 units *and* one of the
 * day's 100 searches per lookup, which is an absurd price for a name lookup you
 * do once. A name that doesn't resolve is reported instead, so you can paste its
 * URL in as a candidate below and re-run.
 *
 * Usage: node scripts/resolve-channels.mjs
 */

import { readFileSync } from 'node:fs'

const ENDPOINT = 'https://www.googleapis.com/youtube/v3/channels'

/**
 * Candidate handles per requested channel, tried in order until one resolves.
 *
 * Several of these are guesses at spelling or disambiguation, which is exactly
 * why the script prints subscriber counts: "Synapse" and "ARTE" have plenty of
 * namesakes, and the count is the quickest way to tell the real one apart.
 */
const WANTED = [
  { name: 'Kill Tony', handles: ['KillTony'] },
  { name: 'Thebausffs', handles: ['Thebausffs', 'thebausffs1'] },
  { name: 'Jimmy Kimmel Live', handles: ['JimmyKimmelLive'] },
  { name: 'Polypuff', handles: ['Polypuff'] },
  { name: 'ARTE', handles: ['arte', 'artetv', 'ARTEde'] },
  { name: 'Beach Volleyball World', handles: ['BeachVolleyballWorld', 'beachvolleyballworld'] },
  { name: 'Hi im Coconut', handles: ['hiimcoconut', 'HiimCoconut', 'hiimcoconut1'] },
  { name: 'Cybernews', handles: ['Cybernews', 'cybernews'] },
  { name: 'Iron Pineapple', handles: ['IronPineapple', 'ironpineapple'] },
  { name: 'Loleventvods', handles: ['LOLeventVODs', 'loleventvods'] },
  { name: 'Synapse', handles: ['Synapse', 'SynapseYT', 'synapse'] },
  { name: 'Sport Arena Network', handles: ['SportArenaNetwork', 'sportarenanetwork'] },
  { name: 'The PrimeTime', handles: ['ThePrimeTimeagen', 'ThePrimetime', 'theprimetime'] },
  { name: 'Konbini', handles: ['Konbini', 'konbini'] },
  { name: 'TEDx Talks', handles: ['TEDx', 'TEDxTalks'] },
  { name: 'IGN', handles: ['IGN'] },
]

/** .env.local isn't loaded outside Next, and dotenv isn't a dependency. */
function readApiKey() {
  if (process.env.YOUTUBE_API_KEY) return process.env.YOUTUBE_API_KEY

  try {
    const match = /^YOUTUBE_API_KEY=(.+)$/m.exec(readFileSync('.env.local', 'utf8'))
    return match?.[1].trim().replace(/^["']|["']$/g, '')
  } catch {
    return undefined
  }
}

const apiKey = readApiKey()

if (!apiKey) {
  console.error('YOUTUBE_API_KEY not found in the environment or .env.local.')
  process.exit(1)
}

let unitsSpent = 0

/** 1 unit. Returns null for "no such handle" so the next candidate can be tried. */
async function lookup(handle) {
  const url = new URL(ENDPOINT)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('part', 'snippet,statistics')
  url.searchParams.set('forHandle', handle.replace(/^@/, ''))

  const response = await fetch(url)
  unitsSpent += 1

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const reason = body?.error?.errors?.[0]?.reason ?? response.status

    // Quota errors are final — keep guessing and every remaining lookup fails too.
    if (reason === 'quotaExceeded' || reason === 'rateLimitExceeded') {
      throw new Error(`Quota exhausted after ${unitsSpent} units. Stopping.`)
    }

    console.warn(`  ! @${handle}: ${body?.error?.message ?? reason}`)
    return null
  }

  const item = (await response.json()).items?.[0]
  if (!item) return null

  return {
    id: item.id,
    title: item.snippet?.title ?? '',
    handle: item.snippet?.customUrl ?? `@${handle}`,
    subscribers: item.statistics?.hiddenSubscriberCount
      ? null
      : Number(item.statistics?.subscriberCount ?? 0),
  }
}

const resolved = []
const unresolved = []

for (const wanted of WANTED) {
  let found = null

  for (const handle of wanted.handles) {
    found = await lookup(handle)
    if (found) break
  }

  if (found) {
    resolved.push({ ...wanted, ...found })
    const subs = found.subscribers === null ? 'hidden' : found.subscribers.toLocaleString('en')
    console.log(`  ok  ${wanted.name.padEnd(24)} → ${found.title} (${found.handle}, ${subs} subs) ${found.id}`)
  } else {
    unresolved.push(wanted)
    console.log(`  ??  ${wanted.name.padEnd(24)} → no channel for ${wanted.handles.map((h) => '@' + h).join(', ')}`)
  }
}

console.log(`\n${resolved.length}/${WANTED.length} resolved · ${unitsSpent} quota units spent · 0 searches\n`)

if (unresolved.length > 0) {
  console.log('Needs a URL: ' + unresolved.map((item) => item.name).join(', ') + '\n')
}

console.log('--- paste into lib/channel-feed.ts ---')
for (const channel of resolved) {
  console.log(`  { id: '${channel.id}', title: ${JSON.stringify(channel.title)}, handle: '${channel.handle}' },`)
}
