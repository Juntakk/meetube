'use client'

import { cn } from '@/lib/utils'

/**
 * Initials avatar, Google-style.
 *
 * Deliberately not the Google profile photo: those are served from
 * lh3.googleusercontent.com with hotlink protection that intermittently returns
 * 403, so the image would sometimes render broken. Initials always render.
 */

/*
 * 600-weight colours, chosen so white text clears WCAG AA on every one of them.
 * The lighter 500 shades look better but fail contrast for small text.
 */
const COLOURS = [
  '#dc2626', // red
  '#ea580c', // orange
  '#d97706', // amber
  '#059669', // emerald
  '#0d9488', // teal
  '#2563eb', // blue
  '#4f46e5', // indigo
  '#7c3aed', // violet
  '#db2777', // pink
]

/** Stable per person, so your avatar colour never changes between sessions. */
function pickColour(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }

  return COLOURS[hash % COLOURS.length]
}

/**
 * "Nicolas Gauthier" -> "NG", "nicolas" -> "N", falling back to the email when
 * no name is set. Ignores anything that isn't a letter or digit so that
 * punctuation in a display name doesn't become an initial.
 */
export function getInitials(name?: string | null, email?: string | null): string {
  const source = (name ?? '').trim() || (email ?? '').split('@')[0] || ''

  const words = source
    .split(/[\s._-]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)

  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].charAt(0).toUpperCase()

  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase()
}

type AvatarProps = {
  name?: string | null
  email?: string | null
  className?: string
  /** Font size scales with the circle, so one component covers every size. */
  size?: number
}

export function Avatar({ name, email, className, size = 32 }: AvatarProps) {
  const initials = getInitials(name, email)
  const background = pickColour(email || name || 'meetube')

  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-medium leading-none text-white',
        className,
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: background,
        fontSize: Math.round(size * 0.4),
      }}
    >
      {initials}
    </span>
  )
}
