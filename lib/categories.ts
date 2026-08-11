/**
 * The chip row above the feed.
 *
 * Two kinds of chip live here, and the difference is the whole reason this file
 * has a type rather than being a list of strings:
 *
 *  - **Chart chips** carry a `videoCategoryId`, one of YouTube's own category ids.
 *    Those can be browsed with `chart=mostPopular&videoCategoryId=…`, which costs
 *    **1 unit** — essentially free, and it doesn't touch the daily search limit.
 *  - **Topic chips** carry a `query` instead, because YouTube has no category for
 *    them. Browsing one runs a real `search.list`: **101 units and one of the
 *    day's 100 searches**, every tap.
 *
 * `chartOnlyIfItWorks` exists because some of YouTube's own categories are useless
 * on the chart: Education and Travel aren't valid chart categories at all (404),
 * and trending in Comedy and Entertainment measured ~99% Shorts. Those still carry
 * their category id — it usefully narrows the search fallback — but the route
 * expects to end up searching. See browseCategory in app/api/search/route.ts.
 */

export type Category = {
  /** Slug used in the `category` URL param. */
  id: string
  label: string
  /** YouTube's own category id, when one exists. Enables the 1-unit chart. */
  videoCategoryId?: string
  /** Search text, for topics YouTube has no category for. */
  query?: string
}

export const CATEGORIES: Category[] = [
  // Topic chips: a search each. Ordered as requested, cheapest not first.
  { id: 'volleyball', label: 'Volleyball', query: 'volleyball' },
  { id: 'programming', label: 'Programming', query: 'programming tutorial' },
  /*
   * "Life" has no natural query — it is the one entry here that is a mood rather
   * than a subject, so this phrasing is a guess. Change the query, not the label,
   * if the results aren't what you meant.
   */
  { id: 'life', label: 'Life', query: 'life advice documentary' },
  // Science & Technology. Chart-eligible, so this one is 1 unit.
  { id: 'science', label: 'Science', videoCategoryId: '28' },
  { id: 'nature', label: 'Nature', query: 'nature documentary' },
  { id: 'chemistry', label: 'Chemistry', query: 'chemistry explained' },
  /*
   * ARTE is a broadcaster, not a topic, so a search only approximates it. Following
   * the channel itself is both more accurate and ~50× cheaper — see the Follow
   * button on any channel page, and lib/followed-channels.ts.
   */
  { id: 'arte', label: 'ARTE', query: 'ARTE documentary' },
  { id: 'news', label: 'News', videoCategoryId: '25' },
  // Chart 404s for Education, so this reliably falls back to a targeted search.
  { id: 'education', label: 'Education', videoCategoryId: '27' },
  { id: 'gaming', label: 'Gaming', videoCategoryId: '20' },
]

const BY_ID = new Map(CATEGORIES.map((category) => [category.id, category]))

export function getCategory(id: string | null | undefined): Category | null {
  if (!id) return null
  return BY_ID.get(id) ?? null
}

/** Guards against arbitrary ids reaching the API from a hand-edited URL. */
export function isValidCategory(id: string | null | undefined): boolean {
  return Boolean(id) && BY_ID.has(id as string)
}

/**
 * Whether browsing this chip has to run a search.
 *
 * True for every topic chip, and it's what the row uses to mark them — a control
 * that quietly spends 1% of the day's search allowance should say so.
 */
export function costsSearch(category: Category): boolean {
  return !category.videoCategoryId
}
