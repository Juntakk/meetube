'use client'

import * as React from 'react'
import { Check, LayoutGrid, Pencil, Plus, Trash2 } from 'lucide-react'

import { Avatar } from '@/components/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useProfiles } from '@/lib/profiles'

/**
 * The switcher sheet: reachable from the side rail (desktop) and the You
 * sheet (phone) — see components/side-rail.tsx and components/bottom-dock.tsx.
 * A dialog rather than the full-screen "Who's watching?" gate, since there's
 * always a page underneath to come back to by dismissing it.
 */
export function ProfileSwitcher({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { profiles, activeId, create, rename, remove, switchTo, leaveToGate } = useProfiles()
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)

  // Fresh input state each time the sheet opens, rather than stale text from
  // last time it was closed mid-edit.
  React.useEffect(() => {
    if (!open) {
      setEditingId(null)
      setAdding(false)
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Switch profile</DialogTitle>
        </DialogHeader>

        <ul className="space-y-1">
          {profiles.map((profile) => (
            <ProfileRow
              key={profile.id}
              name={profile.name}
              current={profile.id === activeId}
              editing={editingId === profile.id}
              onSelect={() => switchTo(profile.id)}
              onStartEdit={() => setEditingId(profile.id)}
              onSubmitEdit={(name) => {
                rename(profile.id, name)
                setEditingId(null)
              }}
              onCancelEdit={() => setEditingId(null)}
              onDelete={profile.id === activeId ? undefined : () => remove(profile.id)}
              seed={profile.id}
            />
          ))}
        </ul>

        {adding ? (
          <NameForm
            autoFocus
            onSubmit={(name) => {
              create(name)
              setAdding(false)
            }}
            onCancel={() => setAdding(false)}
            submitLabel="Add"
          />
        ) : (
          <Button variant="outline" className="justify-start gap-3" onClick={() => setAdding(true)}>
            <Plus className="h-5 w-5" />
            Add profile
          </Button>
        )}

        {/*
          Picking a profile above jumps straight into it. This is for the
          opposite: leaving the one you're in to land back on the full
          "Who's watching?" screen — see lib/profiles.ts's deactivate().
        */}
        <Button variant="ghost" className="justify-start gap-3 text-muted-foreground" onClick={leaveToGate}>
          <LayoutGrid className="h-5 w-5" />
          Back to profile picker
        </Button>
      </DialogContent>
    </Dialog>
  )
}

function ProfileRow({
  name,
  current,
  editing,
  seed,
  onSelect,
  onStartEdit,
  onSubmitEdit,
  onCancelEdit,
  onDelete,
}: {
  name: string
  current: boolean
  editing: boolean
  seed: string
  onSelect: () => void
  onStartEdit: () => void
  onSubmitEdit: (name: string) => void
  onCancelEdit: () => void
  onDelete?: () => void
}) {
  if (editing) {
    return (
      <li>
        <NameForm initialValue={name} autoFocus onSubmit={onSubmitEdit} onCancel={onCancelEdit} submitLabel="Save" />
      </li>
    )
  }

  return (
    <li className="flex items-center gap-1 rounded-lg px-1 py-1 hover:bg-accent">
      <button
        type="button"
        onClick={onSelect}
        className="flex flex-1 items-center gap-3 rounded-lg py-1.5 text-left disabled:cursor-default"
      >
        <Avatar name={name} seed={seed} size={36} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
        {current ? <Check className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Current profile" /> : null}
      </button>

      <button
        type="button"
        onClick={onStartEdit}
        aria-label={`Rename ${name}`}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Pencil className="h-4 w-4" />
      </button>

      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${name}`}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
    </li>
  )
}

function NameForm({
  initialValue = '',
  autoFocus,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialValue?: string
  autoFocus?: boolean
  submitLabel: string
  onSubmit: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = React.useState(initialValue)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (name.trim()) onSubmit(name)
      }}
      className="flex items-center gap-2"
    >
      <Input
        autoFocus={autoFocus}
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={30}
        className="h-10"
      />
      <Button type="submit" size="sm" disabled={!name.trim()}>
        {submitLabel}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  )
}
