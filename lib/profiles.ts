'use client'

import * as React from 'react'

/**
 * Local, password-less "profiles" — Netflix-style, not authentication. Two
 * people share this device; each gets their own followed channels, history
 * and prefs by namespacing every per-person store under whichever profile is
 * active. See lib/local-store.ts for the namespacing itself.
 *
 * The active id is resolved once per document and then frozen — never
 * re-read from storage after that first resolution. A live re-read would let
 * a second tab (or the installed PWA, open alongside a browser tab) discover
 * mid-session that the active profile changed elsewhere, start computing a
 * different profile's keys while its in-memory store caches still held the
 * old profile's data, and on its next write serialize one person's history
 * into the other's key. Freezing means the id a document uses can only
 * change by loading a new document — which is exactly what switchProfile does.
 */

export type Profile = { id: string; name: string }

const PROFILES_KEY = 'meetube:profiles'
const ACTIVE_KEY = 'meetube:active-profile'
const MIGRATED_KEY = 'meetube:migrated-v1'

/**
 * Every per-person suffix that existed before profiles did. An explicit
 * allowlist rather than a `meetube:` prefix sweep, because a sweep would also
 * catch PROFILES_KEY and ACTIVE_KEY and destroy the roster it's building.
 */
const LEGACY_SUFFIXES = [
  'watch-progress',
  'watch-later',
  'followed-channels',
  'watch-history',
  'recent-searches',
  'queue',
  'prefs',
] as const

function randomId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function readProfilesRaw(): Profile[] {
  try {
    const raw = window.localStorage.getItem(PROFILES_KEY)
    const parsed = raw ? (JSON.parse(raw) as Profile[]) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeProfilesRaw(profiles: Profile[]) {
  try {
    window.localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles))
  } catch {
    // Storage blocked; the in-memory cache below still applies this session.
  }
}

/**
 * Moves one suffix's data under a profile if it exists under either the
 * current `meetube:` prefix or the older single-`e` `metube:` prefix — never
 * both. `meetube:` wins when both are present. Idempotent: it only acts when
 * the un-namespaced source key is still there, so running it twice (two tabs
 * racing on first load) or stopping partway through is safe.
 */
function migrateSuffix(suffix: string, profileId: string) {
  for (const prefix of ['meetube', 'metube']) {
    const sourceKey = `${prefix}:${suffix}`
    const raw = window.localStorage.getItem(sourceKey)
    if (raw === null) continue

    const destKey = `meetube:${profileId}:${suffix}`
    if (window.localStorage.getItem(destKey) === null) {
      window.localStorage.setItem(destKey, raw)
    }
    window.localStorage.removeItem(sourceKey)
  }
}

/**
 * Runs once, ever, before any store is read. Existing data — from before
 * profiles existed — becomes the first profile rather than being thrown
 * away. A genuinely fresh install has nothing to migrate, so it's left alone
 * and the "Who's watching?" gate handles it as an ordinary first run.
 */
function runMigration(): void {
  if (window.localStorage.getItem(MIGRATED_KEY)) return

  const hasLegacyData = LEGACY_SUFFIXES.some(
    (suffix) =>
      window.localStorage.getItem(`meetube:${suffix}`) !== null ||
      window.localStorage.getItem(`metube:${suffix}`) !== null,
  )

  if (hasLegacyData) {
    const profiles = readProfilesRaw()

    if (profiles.length === 0) {
      profiles.push({ id: randomId(), name: 'Profile 1' })
      writeProfilesRaw(profiles)
    }

    const targetId = profiles[0].id
    for (const suffix of LEGACY_SUFFIXES) migrateSuffix(suffix, targetId)

    if (window.localStorage.getItem(ACTIVE_KEY) === null) {
      window.localStorage.setItem(ACTIVE_KEY, targetId)
    }
  }

  window.localStorage.setItem(MIGRATED_KEY, '1')
}

let frozenId: string | null | undefined

/**
 * The profile this document is running as. Null until one has ever been
 * chosen — the gate is what handles that case. Resolved on first call and
 * frozen for the rest of the document's life; see the module doc comment.
 */
export function activeProfileId(): string | null {
  if (frozenId !== undefined) return frozenId

  if (typeof window === 'undefined') return null

  runMigration()
  frozenId = window.localStorage.getItem(ACTIVE_KEY)
  return frozenId
}

/**
 * Whether the id this document froze at start-up still matches storage.
 * Used to catch a bfcache restore after a profile switch happened elsewhere —
 * see the pageshow handler in profile-gate.tsx.
 */
export function activeProfileStale(): boolean {
  if (typeof window === 'undefined') return false
  return frozenId !== undefined && window.localStorage.getItem(ACTIVE_KEY) !== frozenId
}

let profilesCache: Profile[] | null = null
const listeners = new Set<() => void>()
const EMPTY_PROFILES: Profile[] = []

function readProfiles(): Profile[] {
  if (profilesCache) return profilesCache
  if (typeof window === 'undefined') return []

  profilesCache = readProfilesRaw()
  return profilesCache
}

function writeProfiles(next: Profile[]) {
  profilesCache = next
  writeProfilesRaw(next)
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)

  const onStorage = (event: StorageEvent) => {
    if (event.key === PROFILES_KEY) {
      profilesCache = null
      listener()
    }
  }

  window.addEventListener('storage', onStorage)

  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

function subscribeNoop() {
  return () => {}
}

/**
 * Same value as activeProfileId(), through useSyncExternalStore purely for
 * the SSR-safe dance: the server (and the hydration pass) see a stable null,
 * then a render immediately after hydration picks up the real id. Calling
 * activeProfileId() directly in a component's render would return the real
 * value on the client's very first render too, before hydration completes,
 * and mismatch whatever the server actually sent.
 */
export function useActiveProfileId(): string | null {
  return React.useSyncExternalStore(subscribeNoop, activeProfileId, () => null)
}

/**
 * Switching, creating and deleting all end in a full navigation rather than a
 * live state update — see the module doc comment for why a live switch can't
 * be made safe, and components/channel-feed.tsx for a concrete case (feed
 * items in useState, keyed on a fetch guard that a same-followed-channels
 * switch would never re-open).
 */
function activate(id: string) {
  try {
    window.localStorage.setItem(ACTIVE_KEY, id)
  } catch {
    // Nothing to do if storage is blocked — the reload below would just land
    // back on the gate.
  }
  window.location.replace('/')
}

/**
 * Clears the active profile and reloads, landing back on the "Who's
 * watching?" gate (see profile-gate.tsx) rather than a specific profile.
 * The profile itself and its data are untouched — this is "switch profiles",
 * not "delete this profile".
 */
function deactivate() {
  try {
    window.localStorage.removeItem(ACTIVE_KEY)
  } catch {
    // Nothing to do if storage is blocked — the reload below would just land
    // back on whichever profile was already active.
  }
  window.location.replace('/')
}

export function useProfiles() {
  const profiles = React.useSyncExternalStore(subscribe, readProfiles, () => EMPTY_PROFILES)

  const create = React.useCallback((name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return

    const id = randomId()
    writeProfiles([...readProfiles(), { id, name: trimmed }])
    activate(id)
  }, [])

  const rename = React.useCallback((id: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return

    writeProfiles(readProfiles().map((profile) => (profile.id === id ? { ...profile, name: trimmed } : profile)))
  }, [])

  /**
   * Deleting the profile you're currently running as would leave this
   * document's frozen id pointing nowhere — switch to another profile first.
   */
  const remove = React.useCallback((id: string) => {
    if (id === activeProfileId()) return

    writeProfiles(readProfiles().filter((profile) => profile.id !== id))

    for (const suffix of LEGACY_SUFFIXES) {
      try {
        window.localStorage.removeItem(`meetube:${id}:${suffix}`)
      } catch {
        // Best-effort cleanup; an orphaned key just sits there unused.
      }
    }
  }, [])

  const switchTo = React.useCallback((id: string) => activate(id), [])
  const leaveToGate = React.useCallback(() => deactivate(), [])
  const activeId = useActiveProfileId()

  return { profiles, activeId, create, rename, remove, switchTo, leaveToGate }
}
