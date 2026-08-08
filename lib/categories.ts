/**
 * YouTube video category IDs, used two ways:
 *
 *  - with a query, as a `videoCategoryId` filter on search.list (100 units)
 *  - without a query, as `chart=mostPopular&videoCategoryId=…` on videos.list,
 *    which costs **1 unit** — so browsing a category is essentially free
 *
 * IDs are YouTube's own and are stable; the labels are shortened for chips.
 */

export type Category = {
  id: string
  label: string
}

export const CATEGORIES: Category[] = [
  { id: '10', label: 'Music' },
  { id: '20', label: 'Gaming' },
  { id: '17', label: 'Sports' },
  { id: '24', label: 'Entertainment' },
  { id: '23', label: 'Comedy' },
  { id: '25', label: 'News' },
  { id: '28', label: 'Science & Tech' },
  { id: '27', label: 'Education' },
  { id: '26', label: 'How-to & Style' },
  { id: '1', label: 'Film & Animation' },
  { id: '15', label: 'Pets & Animals' },
  { id: '2', label: 'Autos' },
  { id: '19', label: 'Travel' },
  { id: '22', label: 'People & Blogs' },
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
