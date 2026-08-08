/**
 * Declared interests + a quality gate.
 *
 * The taste profile in taste-profile.ts learns from behaviour, but it starts
 * empty — and an empty profile has nothing to recommend. These topics seed the
 * feed from the very first launch, so it is on-subject before you've done
 * anything at all.
 *
 * Division of labour: the seeds establish *topic*, so the candidate pool is
 * on-subject by construction. The blocklist and clickbait score here remove
 * *junk*. Keyword matching only boosts ranking — it is not an entry requirement,
 * because good titles ("Why does every mammal get 1 billion heartbeats?") often
 * contain no topic keyword at all.
 *
 * Pure functions only, so the whole gate is testable without the API.
 */

export type Interest = {
  id: string
  label: string
  /** Sent to search.list. Real phrases, because they're used verbatim as queries. */
  queries: string[]
  /**
   * Matched against the TITLE only (see matchInterests). Every term here has to
   * be specific enough that its presence in a title genuinely means the video is
   * about this topic — generic words like "research", "brain" or "explained"
   * were tried and matched half of YouTube.
   */
  terms: string[]
}

export const INTERESTS: Interest[] = [
  {
    id: 'volleyball',
    label: 'Volleyball',
    queries: [
      'volleyball match highlights full',
      'volleyball training drills technique',
      'volleyball tactics explained',
    ],
    terms: ['volleyball', 'beach volleyball', 'fivb', 'libero', 'setter drills'],
  },
  {
    id: 'wellbeing',
    label: 'Well-being',
    queries: [
      'guided meditation practice',
      'stoicism philosophy explained',
      'sleep science explained',
      'breathwork practice',
    ],
    terms: [
      'meditation', 'mindfulness', 'stoicism', 'stoic', 'breathwork', 'journaling',
      'mental health', 'burnout', 'gratitude', 'self compassion', 'philosophy',
      'sleep science', 'nervous system', 'psychology',
    ],
  },
  {
    id: 'history',
    label: 'History',
    queries: [
      'ancient history documentary',
      'history documentary full episode',
      'archaeology documentary',
    ],
    terms: [
      'history', 'ancient egypt', 'ancient rome', 'ancient greece', 'roman empire',
      'medieval', 'archaeology', 'archaeological', 'pharaoh', 'mesopotamia',
      'byzantine', 'ottoman', 'renaissance', 'world war', 'civilisation', 'civilization',
      'dynasty', 'antiquity',
    ],
  },
  {
    id: 'culture',
    label: 'Culture & art',
    queries: [
      'art history documentary',
      'world culture documentary',
      'architecture documentary',
    ],
    terms: [
      'art history', 'museum', 'architecture', 'literature', 'poetry',
      'classical music', 'calligraphy', 'anthropology', 'mythology', 'heritage',
    ],
  },
  {
    id: 'science',
    label: 'Science',
    queries: [
      'physics explained documentary',
      'astronomy documentary',
      'science explained lecture',
    ],
    terms: [
      'physics', 'astronomy', 'cosmology', 'quantum', 'astrophysics', 'mathematics',
      'geology', 'thermodynamics', 'relativity', 'periodic table', 'scientific',
    ],
  },
  {
    id: 'biology',
    label: 'Biology',
    queries: [
      'biology lecture explained',
      'human body documentary',
      'neuroscience explained',
    ],
    terms: [
      'biology', 'neuroscience', 'dna', 'genetics', 'genome', 'evolution',
      'anatomy', 'physiology', 'microbiology', 'ecology', 'immune system',
      'botany', 'cell biology', 'photosynthesis',
    ],
  },
  {
    id: 'chemistry',
    label: 'Chemistry',
    queries: [
      'chemistry explained lecture',
      'organic chemistry tutorial',
      'chemistry experiment explained',
    ],
    terms: [
      'chemistry', 'organic chemistry', 'molecule', 'molecular', 'biochemistry',
      'titration', 'catalyst', 'polymer', 'chemical bond', 'stoichiometry',
    ],
  },
  {
    id: 'egyptian-arabic',
    label: 'Egyptian Arabic',
    queries: [
      'learn egyptian arabic lesson',
      'egyptian arabic conversation practice',
      'egyptian arabic vocabulary',
    ],
    terms: [
      'egyptian arabic', 'masri', 'arabic lesson', 'learn arabic', 'arabic vocabulary',
      'arabic grammar', 'arabic conversation', 'arabic phrases', 'colloquial arabic',
    ],
  },
  {
    id: 'sport',
    label: 'Sport & training',
    queries: ['strength training technique explained', 'sports science explained'],
    terms: [
      'strength training', 'sports science', 'conditioning', 'mobility drills',
      'biomechanics', 'athlete training',
    ],
  },
]

export const DEFAULT_INTEREST_IDS = INTERESTS.map((interest) => interest.id)

const BY_ID = new Map(INTERESTS.map((interest) => [interest.id, interest]))

export function getInterests(ids: string[]): Interest[] {
  return ids.map((id) => BY_ID.get(id)).filter((i): i is Interest => Boolean(i))
}

/*
 * Hard blocks — removed outright, never merely ranked down.
 *
 * Phrase-level rather than single words, because the obvious single words
 * collide with the topics above: "reaction" is chemistry, "vs" is every sports
 * fixture, "drama" is theatre. Each entry has to be junk in nearly every context.
 */
const BLOCKED_PHRASES = [
  'reacts to', 'reacting to', 'reaction video', 'react to this',
  'prank', 'gone wrong', 'gone sexual',
  'exposed', 'exposing', 'clout', 'beef with', 'diss track',
  'drama alert', 'tea spill', 'spilling the tea', 'gossip',
  'celebrity', 'red carpet', 'kardashian', 'love island',
  'clickbait', "you won't believe", 'you wont believe', 'will shock you',
  'brainrot', 'brain rot', 'sigma male', 'rizz', 'gyatt', 'skibidi',
  'get rich quick', 'make money fast', 'passive income hack',
  'casino', 'gambling', 'betting tips', 'crypto pump',
  'tier list', 'ranking every', 'worst of all time',
  'try not to laugh', 'funny moments compilation', 'fails compilation',
  'conspiracy', 'flat earth', 'illuminati',
  'asmr mukbang', 'mukbang',
  '24 hour challenge', 'i survived',

  // True crime keeps matching the well-being and history vocabularies while
  // being the opposite of a calm feed.
  'true crime', 'homicide', 'murder', 'murdered', 'serial killer',
  'family annihilator', 'missing person', 'cold case', 'manhunt',
  'the case of', 'disappearance of', 'crime scene',

  // Toddler and preschool material dominates YouTube's Education category.
  'for toddlers', 'for kids', 'for children', 'nursery rhymes', 'preschool',
  'abc song', 'baby learning', 'kids learning', 'learn colors', 'learn colours',
  'learn shapes', 'for babies', 'kindergarten', 'toddler learning',
]

/** Softer signals — these demote rather than remove. */
const CLICKBAIT_PHRASES = [
  'shocking', 'insane', 'crazy', 'unbelievable', 'must watch', 'no one talks about',
  'the truth about', "what they don't want", 'secret', 'hack', 'destroyed', 'owned',
  'epic', 'ultimate', 'nobody knows',
]

/**
 * Title only, for the same reason matchInterests is title-only: descriptions are
 * noisy enough to produce false positives in both directions. A Veritasium video
 * about forensic science was being blocked because its description mentioned
 * crime. Genuine true-crime and kids content names itself in the title.
 */
export function isBlocked(title: string): boolean {
  const haystack = title.toLowerCase()
  return BLOCKED_PHRASES.some((phrase) => haystack.includes(phrase))
}

/**
 * 0 (clean) to 1 (screaming clickbait), from title styling plus the soft phrase
 * list. Titles are the only clickbait signal available without fetching more.
 */
export function clickbaitScore(title: string): number {
  if (!title) return 0

  const lower = title.toLowerCase()
  let score = 0

  // Shouty words (4+ letters, all caps). One or two is a style; five is a scream.
  const words = title.split(/\s+/).filter((w) => w.length >= 4)
  const shouty = words.filter((w) => /^[A-Z]{4,}$/.test(w.replace(/[^A-Za-z]/g, ''))).length
  if (words.length > 0) score += Math.min(0.4, (shouty / words.length) * 1.2)

  // Runs of !!! or ???
  const bangs = (title.match(/[!?]/g) ?? []).length
  score += Math.min(0.2, bangs * 0.07)

  // Emoji pile-ups in the title.
  const emoji = (title.match(/\p{Extended_Pictographic}/gu) ?? []).length
  score += Math.min(0.2, emoji * 0.07)

  const phrases = CLICKBAIT_PHRASES.filter((phrase) => lower.includes(phrase)).length
  score += Math.min(0.4, phrases * 0.15)

  return Math.min(1, score)
}

export type InterestMatch = {
  /** 0–1, how strongly this matches the enabled topics. */
  score: number
  /** Labels of the topics that matched, for the "why am I seeing this" line. */
  labels: string[]
}

/**
 * Matches the **title only**.
 *
 * Descriptions were included at first and wrecked the gate: they run to
 * thousands of characters of sponsor copy, link dumps and channel boilerplate,
 * so a single incidental word qualified a video. A true-crime episode matched
 * "Well-being" and a Madden video matched "History" that way. The title is the
 * one field that reliably describes the video.
 *
 * Word-boundary anchored so "art" doesn't match "start", and phrase-based so
 * "egyptian arabic" and "organic chemistry" only fire as whole phrases.
 */
export function matchInterests(
  title: string,
  _description: string,
  interests: Interest[],
): InterestMatch {
  const haystack = title.toLowerCase()

  const labels: string[] = []
  let matchedTopics = 0

  for (const interest of interests) {
    const matched = interest.terms.some((term) =>
      new RegExp(`(?:^|[^\\p{L}])${escapeRegExp(term)}(?:[^\\p{L}]|$)`, 'u').test(haystack),
    )

    if (matched) {
      labels.push(interest.label)
      matchedTopics += 1
    }
  }

  // One solid topic hit is enough to qualify; two is a strong signal.
  return { score: Math.min(1, matchedTopics / 2), labels }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
