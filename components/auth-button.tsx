'use client'

import * as React from 'react'
import { signIn, signOut, useSession } from 'next-auth/react'
import { LogIn, LogOut } from 'lucide-react'

import { Avatar } from '@/components/avatar'
import { RelinkNotice } from '@/components/relink-notice'
import { MISSING_SCOPE_ERROR } from '@/lib/oauth-scope'
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
  const sessionError = (session as { error?: string } | null)?.error
  const refreshFailed = sessionError === 'RefreshAccessTokenError'
  /*
   * Distinct from an expired session: this token is alive and will keep working
   * for everything except subscriptions, because Google granted it before the app
   * asked for YouTube access. Only re-consenting changes that.
   */
  const missingScope = sessionError === MISSING_SCOPE_ERROR

  if (!linked) {
    return (
      // Icon only on a phone, where the dock's "You" tab carries the wording.
      <Button
        variant="pill"
        size="pill"
        onClick={() => signIn('google')}
        aria-label="Link YouTube"
        className="max-md:h-10 max-md:w-10 max-md:px-0"
      >
        <LogIn />
        <span className="hidden md:inline">Link YouTube</span>
      </Button>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // 40px of tap target around a 32px avatar.
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        title={session?.user?.email ?? 'Account'}
      >
        <Avatar name={session?.user?.name} email={session?.user?.email} size={32} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <Avatar name={session?.user?.name} email={session?.user?.email} size={40} />
              <div className="min-w-0 text-left">
                <DialogTitle className="truncate">
                  {session?.user?.name ?? 'YouTube linked'}
                </DialogTitle>
                <DialogDescription className="truncate">
                  {session?.user?.email}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {refreshFailed ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              Your Google session expired and couldn&rsquo;t be renewed. Sign in again to keep using
              your subscriptions.
            </p>
          ) : missingScope ? (
            <RelinkNotice compact className="rounded-md" />
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
