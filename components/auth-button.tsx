'use client'

import * as React from 'react'
import Image from 'next/image'
import { signIn, signOut, useSession } from 'next-auth/react'
import { LogIn, LogOut } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type AuthButtonProps = {
  /** False when GOOGLE_CLIENT_ID isn't set, in which case sign-in is hidden. */
  configured: boolean
}

export function AuthButton({ configured }: AuthButtonProps) {
  const { data: session, status } = useSession()
  const [open, setOpen] = React.useState(false)

  // Nothing to offer if the OAuth client was never set up.
  if (!configured) return null

  if (status === 'loading') return null

  const linked = Boolean(session)
  const image = session?.user?.image
  const refreshFailed = (session as { error?: string } | null)?.error === 'RefreshAccessTokenError'

  if (!linked) {
    return (
      <Button variant="outline" size="sm" onClick={() => signIn('google')}>
        <LogIn />
        <span className="hidden sm:inline">Link YouTube</span>
      </Button>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        title={session?.user?.email ?? 'Account'}
      >
        {image ? (
          <Image
            src={image}
            alt=""
            width={28}
            height={28}
            className="rounded-full"
            unoptimized
          />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
            {(session?.user?.name ?? '?').charAt(0).toUpperCase()}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>YouTube linked</DialogTitle>
            <DialogDescription>{session?.user?.email}</DialogDescription>
          </DialogHeader>

          {refreshFailed ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              Your Google session expired and couldn&rsquo;t be renewed. Sign in again to keep using
              your subscriptions.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Your feed is built from your real subscriptions, which costs about 1 unit per channel
              instead of the 100 a topic search costs. MeeTube has read-only access — it can&rsquo;t
              subscribe, comment, or change anything on your account.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Your watch history and saved videos stay on this device either way; signing in adds a
            source of recommendations, it doesn&rsquo;t upload anything.
          </p>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setOpen(false)
              signOut()
            }}
          >
            <LogOut />
            Unlink
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
