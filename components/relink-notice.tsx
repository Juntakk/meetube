'use client'

import * as React from 'react'
import { signIn } from 'next-auth/react'
import { ExternalLink, LogIn } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The "MeeTube can't read your subscriptions" notice, shared by the home feed
 * and the account dialog so both tell the same story.
 *
 * Why this needs to be more than one sentence and a button: the obvious fix —
 * sign in again — frequently doesn't work, for two reasons that both look
 * identical from inside the app.
 *
 * 1. Google's consent screen asks for sensitive scopes with a *checkbox*, not as
 *    all-or-nothing. Clicking through without ticking "See your YouTube account"
 *    produces a perfectly valid sign-in that still can't read subscriptions.
 * 2. Google may skip the consent screen entirely when a grant already exists,
 *    handing back the old, narrower scope set without ever asking.
 *
 * Either way the banner reappears and the button appears to do nothing. So the
 * notice escalates: once a link attempt has been made and we're still here, it
 * stops repeating "link again" and points at the one thing that always works —
 * revoking the grant, which guarantees a full consent screen next time.
 */

/** Survives the OAuth round-trip: same tab, so sessionStorage is intact on return. */
const ATTEMPT_KEY = 'meetube:relink-attempted'

const PERMISSIONS_URL = 'https://myaccount.google.com/permissions'

/**
 * Start a re-consent. The params are already the provider defaults in
 * lib/auth.ts; they're repeated here because this is the one flow where losing
 * them turns the whole exercise into a no-op.
 */
export function startRelink() {
  try {
    window.sessionStorage.setItem(ATTEMPT_KEY, '1')
  } catch {
    // Storage blocked. The first-attempt copy is a reasonable fallback.
  }

  void signIn('google', undefined, {
    prompt: 'consent',
    include_granted_scopes: 'true',
  })
}

type RelinkNoticeProps = {
  /** Tighter type and stacked buttons, for inside the account dialog. */
  compact?: boolean
  className?: string
}

export function RelinkNotice({ compact = false, className }: RelinkNoticeProps) {
  /*
   * Read in an effect rather than during render: sessionStorage doesn't exist on
   * the server, and reading it inline would make the markup differ from the
   * server's and break hydration.
   */
  const [retried, setRetried] = React.useState(false)

  React.useEffect(() => {
    try {
      setRetried(window.sessionStorage.getItem(ATTEMPT_KEY) === '1')
    } catch {
      // Leave it on the first-attempt copy.
    }
  }, [])

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3',
        className,
      )}
    >
      <div className={cn('space-y-1 text-amber-500', compact ? 'text-xs' : 'text-sm')}>
        {retried ? (
          <>
            <p>
              Still no YouTube permission. Either the consent screen was skipped — Google does that
              when a grant already exists — or the &ldquo;See your YouTube account&rdquo; checkbox on
              it was left unticked.
            </p>
            <p className="text-amber-500/80">
              Removing MeeTube&rsquo;s access forces the full consent screen next time. Everything
              else keeps working meanwhile; the feed is built from your topics.
            </p>
          </>
        ) : (
          <>
            <p>
              MeeTube can&rsquo;t read your subscriptions: your Google sign-in was granted before it
              asked for YouTube access. Everything else works — this feed is built from your topics
              instead.
            </p>
            <p className="text-amber-500/80">
              The consent screen lists YouTube as its own checkbox. It has to be ticked, or the new
              sign-in lands right back here.
            </p>
          </>
        )}
      </div>

      <div className={cn('flex shrink-0 flex-wrap gap-2', compact ? '' : 'sm:justify-end')}>
        {retried ? (
          <Button
            variant="outline"
            size={compact ? 'sm' : 'pill'}
            className="border-amber-500/40 text-amber-500"
            asChild
          >
            <a href={PERMISSIONS_URL} target="_blank" rel="noreferrer noopener">
              <ExternalLink />
              Remove access
            </a>
          </Button>
        ) : null}

        <Button
          variant="outline"
          size={compact ? 'sm' : 'pill'}
          className="border-amber-500/40 text-amber-500"
          onClick={startRelink}
        >
          <LogIn />
          Link again
        </Button>
      </div>
    </div>
  )
}
