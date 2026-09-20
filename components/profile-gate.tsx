'use client'

import * as React from 'react'
import { Plus } from 'lucide-react'

import { Avatar } from '@/components/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { activeProfileStale, useProfiles } from '@/lib/profiles'
import { cn } from '@/lib/utils'

/**
 * The "Who's watching?" first-run screen, and the guard against a stale
 * bfcache restore after a profile switch.
 *
 * Rendered as a sibling of the page content, not a wrapper around it — the
 * common case (a profile is already active) needs to show nothing at all
 * and let the page's own server-rendered content stand, rather than holding
 * it back until this component decides. Nothing renders until after mount,
 * so this never has to reconcile a server guess against the real answer:
 * the server has no idea which profile is active, and there's no server
 * guess that wouldn't sometimes flash the wrong thing.
 */
export function ProfileGate() {
  const { profiles, activeId, create, switchTo } = useProfiles()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => setMounted(true), [])

  React.useEffect(() => {
    // A profile switch elsewhere is always a fresh navigation on that side,
    // but this document can come back from bfcache on a `back` press and
    // resume running as if nothing happened, with the old profile's stores
    // still live in memory. Force it to reload rather than silently writing
    // the old profile's data under a key it no longer owns.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted && activeProfileStale()) window.location.reload()
    }

    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  if (!mounted || activeId) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-background px-6">
      <div className="text-center">
        <h1 className="text-2xl font-medium">Who&rsquo;s watching?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Separate follows, history and settings for everyone on this device. No password —
          anyone here can open any profile.
        </p>
      </div>

      <div className="flex flex-wrap items-start justify-center gap-6">
        {profiles.map((profile) => (
          <button
            key={profile.id}
            type="button"
            onClick={() => switchTo(profile.id)}
            className="flex flex-col items-center gap-2 rounded-lg p-2 md:hover:opacity-80"
          >
            <Avatar name={profile.name} seed={profile.id} size={72} className="text-xl" />
            <span className="max-w-24 truncate text-sm font-medium">{profile.name}</span>
          </button>
        ))}

        <AddProfileTile onCreate={create} />
      </div>
    </div>
  )
}

function AddProfileTile({ onCreate }: { onCreate: (name: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState('')

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-col items-center gap-2 rounded-lg p-2 md:hover:opacity-80"
      >
        <span
          aria-hidden
          className="grid h-[72px] w-[72px] place-items-center rounded-full border-2 border-dashed border-muted-foreground/40 text-muted-foreground"
        >
          <Plus className="h-7 w-7" strokeWidth={1.75} />
        </span>
        <span className="text-sm font-medium text-muted-foreground">Add profile</span>
      </button>
    )
  }

  const submit = () => {
    if (name.trim()) onCreate(name)
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className={cn('flex w-40 flex-col items-center gap-2 rounded-lg p-2')}
    >
      <Avatar name={name || '?'} size={72} className="text-xl opacity-70" />
      <Input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Name"
        maxLength={30}
        className="h-9 text-center text-sm"
      />
      <Button type="submit" size="sm" disabled={!name.trim()} className="w-full">
        Add
      </Button>
    </form>
  )
}
