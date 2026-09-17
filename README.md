# MeeTube

YouTube search with Shorts stripped out. Anything **3 minutes or shorter** never appears in the
results. Built as an installable PWA so it can live on a phone home screen.

## Quick start

```bash
npm install
cp .env.local.example .env.local   # then paste your key in (see below)
npm run dev
```

Open http://localhost:3000.

## Getting a YouTube Data API key

1. Go to <https://console.cloud.google.com/> and sign in with a Google account.
2. **Create a project** — click the project dropdown in the top bar → *New Project*. Name it
   something like `meetube` and click *Create*. Wait for it to finish, then make sure it's the
   selected project in the top bar.
3. **Enable the API** — go to *APIs & Services* → *Library* (or
   <https://console.cloud.google.com/apis/library/youtube.googleapis.com>), search for
   **YouTube Data API v3**, open it, and click **Enable**.
4. **Create the key** — go to *APIs & Services* → *Credentials* → *Create Credentials* →
   **API key**. The key appears in a dialog; copy it. It looks like `AIzaSy...` (~39 characters).
5. **Restrict the key** (recommended, do it from the same dialog via *Edit API key*):
   - *API restrictions* → **Restrict key** → tick **YouTube Data API v3** only.
   - *Application restrictions* → leave as **None**. This key is used from your server, not the
     browser, so an HTTP-referrer restriction would break it. If you deploy somewhere with stable
     egress IPs, an **IP address** restriction is the right choice.
   - Click *Save*. Restriction changes can take up to ~5 minutes to take effect.

No billing account is required — the YouTube Data API has a free daily quota.

### Adding it to `.env.local`

```bash
cp .env.local.example .env.local
```

Then edit `.env.local` so it reads:

```
YOUTUBE_API_KEY=AIzaSyYourActualKeyGoesHere
```

No quotes, no spaces around the `=`. **Restart the dev server** afterwards — Next.js only reads
env files at startup.

`.env.local` is gitignored. The variable deliberately has no `NEXT_PUBLIC_` prefix, so it is only
ever available on the server; every YouTube call goes through `/api/search`.

When you deploy, set `YOUTUBE_API_KEY` in your host's environment variable settings (on Vercel:
*Project → Settings → Environment Variables*).

### Quota notes

The default allowance is **10,000 units/day**, and `search.list` is the only expensive call:

| Operation | Cost | Used by |
| --- | --- | --- |
| `search.list` | **100** | every text search, each infinite-scroll page |
| `videos.list` (any parts, up to 50 ids) | **1** | durations + statistics, always batched |
| `videos.list?chart=mostPopular` | **1** | cheap category browsing (never the feed) |
| `channels.list` + `playlistItems.list` | **1 + 1** | channel browsing, and every channel in the home feed |

So a search page is ~101 units (~99/day), while **reading a channel's uploads costs 2 units
instead of 100** by going through its uploads playlist rather than a channel-scoped search — the
whole home feed of 16 channels costs ~21 units. Statistics are free — `videos.list` costs 1 unit
regardless of how many `part`s you ask for.

### The quota meter

The header shows searches remaining, with a detail panel behind it (units used, time to reset,
and a manual correction field).

Two things make this less simple than it looks:

**Search has its own daily metric, separate from the unit budget.** Verified against a real
exhausted key: `search.list` failed with *"Quota exceeded for quota metric 'Search Queries' and
limit 'Search Queries per day'"* while `videos.list` kept working normally. So category and channel
browsing keep working after searches run out, and "searches left" is tracked as its own counter
rather than derived from units.

**The API exposes no usage endpoint,** so [lib/quota.ts](lib/quota.ts) counts what this app spends
using published per-method costs, persisted to `.quota.json` (gitignored) and keyed by the Pacific
day. Costs are recorded *after* a call succeeds — a rejected request isn't charged.

That count is only as good as its coverage. If the ledger starts mid-day, or the key is used
elsewhere, real usage is higher than recorded — so the meter shows **"≤ N searches left"** rather
than asserting a figure it can't back up. It becomes exact the moment the API refuses a search
(that verdict is sticky for the rest of the day) or you correct it by hand.

### Limiting what you spend

Two controls in the quota panel, both aimed at the things that actually cost units:

- **Daily search limit.** A cap you set. Enforced in `searchVideoIds()` rather than in a route, so
  every path that searches obeys it — plain search and the category fallback. The home feed never
  calls `search.list` at all, so it's unaffected either way. The cap throws *before* the fetch, so
  a blocked search costs nothing.
- **Load more as I scroll** — **off by default**. The infinite-scroll observer fires 400px before
  the sentinel is visible, so idle scrolling silently spends 101 units a page. With it off, another
  page is fetched only when you press the button, which is labelled with its cost.

Note that **`maxResults` is not a quota control**. `search.list` is billed a flat 100 units whether
it returns 1 result or 50, so the app always asks for 50 — the maximum. Lowering it would return
fewer videos for the same price and force more paging.

The authoritative figure is always
[Google Cloud → APIs & Services → Quotas](https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas).

## How the Shorts filter works

`search.list` doesn't return durations, so `/api/search` does two calls:

1. `search.list` (`part=snippet`, `type=video`, `videoEmbeddable=true`) → up to 50 video IDs.
2. A single batched `videos.list` (`part=contentDetails,snippet,statistics`) for all of those IDs.

Each `contentDetails.duration` is an ISO 8601 string (`PT4M13S`), parsed in
[lib/youtube.ts](lib/youtube.ts) and dropped if it's ≤ 180s. Results keep their original relevance
order. Live and upcoming broadcasts report a zero duration, so they're excluded by
`liveBroadcastContent` rather than by length.

The cutoff is **3 minutes**, not 60 seconds, because YouTube raised the Shorts ceiling to 3 minutes
in Oct 2024 — a 60s rule would let plenty of Shorts through. The filter is duration-only: nothing
ever requests a `youtube.com/shorts/` URL, and the only outbound host is `googleapis.com`. The
tradeoff is that genuinely short long-form videos (trailers, music videos, news clips) get hidden
too; change `SHORTS_MAX_SECONDS` in [lib/youtube.ts](lib/youtube.ts) to tune it. The UI copy reads
from that same constant, so it stays in sync.

Because a page of 50 can be almost entirely Shorts, the client walks up to 3 `nextPageToken` hops
before it will show an empty state — otherwise a good query could look like it had no results.

## Category browsing

The chip row maps to YouTube's own `videoCategoryId` values ([lib/categories.ts](lib/categories.ts)).
With a query typed in, a chip narrows the search. With the box empty, it browses the category —
and that path is deliberately cheapest-first:

1. **`chart=mostPopular&videoCategoryId=…` — 1 unit.** Works well for Gaming, News, Music and
   People & Blogs.
2. **Fall back to a search on the category's own name — 101 units.** Needed because trending in
   Comedy and Entertainment is ~99% Shorts (measured: **198 of 200**), and because Education and
   Travel aren't valid chart categories at all — YouTube returns 404 for them.

`search.list` can't browse a category on its own; called with `videoCategoryId` and no `q` it
returns zero results, which is why the fallback searches the category label.

Page tokens are prefixed `c:` or `s:` so a follow-up page continues on the same source — chart and
search tokens aren't interchangeable, and mixing them would repeat videos. Once a category commits
to the chart it stays there for subsequent pages.

Net result: 4 of 14 categories browse for 1 unit, the rest cost a search.

## The channel feed

The home page shows the latest uploads from a fixed, curated list of channels — no
recommendation engine, no watch-history inference, no account linking. What's on screen is
exactly what those channels posted, shuffled.

### The channel list

Defined once, in [lib/channel-feed.ts](lib/channel-feed.ts) (`FEED_CHANNELS`). Each entry is a
resolved `UC…` channel id, a title, and a handle. To add a channel: run
`node scripts/resolve-channels.mjs` to resolve its id from its handle (1 unit, no search), then
append the printed entry to the list. Nothing else needs to change.

### What gets fetched

[`/api/feed`](app/api/feed/route.ts) reads the **last 10 uploads from every channel** in the list
through [`fetchUploadsForChannels`](lib/youtube-server.ts) — the same batched
channels.list → playlistItems.list → videos.list path the old subscriptions feed used, which is
**50× cheaper than a channel-scoped search** (2 units instead of 100 per channel). For 16
channels that's about **21 units and zero searches** per refresh, against a 10,000/day budget —
cheap enough to refresh as often as you like.

The API returns the pooled candidates (~160 videos) sorted **newest first** — that's the one
canonical order, since the candidates come from several channels' playlists interleaved by upload
depth, not by date. Shuffling is a client-side, on-demand view over that same list, not a second
fetch: the icon button in the feed header toggles between "Shuffled" (the default) and "Newest
first", and the choice is remembered ([lib/prefs.ts](lib/prefs.ts), `feedSort`). Shuffling happens
once per fetch, so toggling back and forth doesn't reshuffle — only Refresh does.

### Caching

The fetched result is cached in localStorage for **1 hour**. Leaving a video and coming back
restores the same feed in the same order — it doesn't reshuffle on its own. The refresh button
re-fetches, and its tooltip states the cost up front. Appending a channel to `FEED_CHANNELS`
changes the cache key, so the feed picks it up automatically on the next load.

## PWA / installing

- [public/manifest.json](public/manifest.json) — `display: standalone`, theme color, icons.
- iOS meta tags (`apple-mobile-web-app-capable`, `apple-touch-icon`, status bar style) are in
  [app/layout.tsx](app/layout.tsx).
- [public/sw.js](public/sw.js) is a minimal service worker — cache-first for hashed build assets,
  network-first for everything else, and `/api/*` is never cached. It only registers in production.

**Install on iPhone:** open the site in Safari → Share → *Add to Home Screen*. iOS only honours the
apple-* meta tags in Safari, not Chrome. To test from your phone against your dev machine, run
`npm run dev -- -H 0.0.0.0` and visit `http://<your-mac-ip>:3000` — though installability and the
service worker need HTTPS, so use a deployed build or a tunnel for the real thing.

**Icons:** a white play glyph on an orange rounded square with a transparent background, generated
by [scripts/generate-icons.mjs](scripts/generate-icons.mjs) with no dependencies — it hand-rolls an
RGBA PNG encoder and an ICO wrapper. `npm run icons` emits `icon-{32,180,192,512}.png`,
`favicon.ico`, and a full-bleed `icon-maskable-512.png` (Android crops maskable icons to its own
shape, and a transparent one would render as a hole). Change `ACCENT` in that script to retint, or
replace the files with real artwork.

## Features

- **Search** with Shorts filtered out, infinite scroll, skeleton loading, actionable empty states
- **Category chips** — 14 YouTube categories, browsable on their own or as a search refinement
- **Recent searches** drop down when the search box is focused and empty
- **Filters** behind the slider button — sort (relevance/newest/views/rating), upload date, and
  length. The length filter also saves quota, since YouTube excludes short videos server-side
  instead of us discarding them
- **Channel feed** on the home page — the latest uploads from a fixed list of channels, shuffled
- **Watch later** — bookmark videos; the list is stored in full, so browsing it costs no quota
- **Channel browsing** — tap a channel name to see its recent uploads (2 units, not 100)
- **URL-synced state** — refresh, back/forward, and shared links all restore the same view
- **View counts** on every card, free via the already-batched `videos.list` call

## Project layout

```
app/
  api/search/route.ts    search, category + channel browsing, Shorts filtering
  api/feed/route.ts      fetches + shuffles the fixed channel list for the home feed
  layout.tsx             metadata, PWA meta tags, dark mode
  page.tsx
components/
  search-view.tsx        URL-driven search state, infinite scroll, empty states
  channel-feed.tsx       home feed: fetch, cache, render — no ranking
  category-chips.tsx     scrollable category row
  search-suggestions.tsx recent searches dropdown
  filter-bar.tsx         sort / uploaded / length
  video-card.tsx         result card with stats + save toggle
  video-dialog.tsx       modal with the embedded player
  ui/                    shadcn/ui primitives
lib/
  youtube.ts             shared types, ISO 8601 parsing, formatting
  youtube-server.ts      server-only API calls (never import from a client component)
  channel-feed.ts        the home feed's channel list + the shuffle helper
  categories.ts          YouTube category ids
  filters.ts             filter definitions shared by client and server
  local-store.ts         localStorage list store used by the three below
  watch-later.ts / watch-history.ts / recent-searches.ts
scripts/
  resolve-channels.mjs   one-off: resolve a channel name to its UC… id (1 unit, no search)
```

`filters.ts`, `channel-feed.ts`'s `shuffle()`, and the duration helpers in `youtube.ts` are pure
functions with no I/O.

## Scripts

| Command         | Description                        |
| --------------- | ---------------------------------- |
| `npm run dev`   | Dev server                         |
| `npm run build` | Production build (typechecks too)  |
| `npm start`     | Serve the production build         |
| `npm run lint`  | ESLint                             |
| `npm run icons` | Regenerate the placeholder icons   |
