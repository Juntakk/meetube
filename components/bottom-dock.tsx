'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { signIn, signOut, useSession } from 'next-auth/react'
import { Bookmark, History, Home, LogIn, LogOut, Search, User, type LucideIcon } from 'lucide-react'

import { Avatar } from '@/components/avatar'
import { openSearchOverlay } from '@/components/search-overlay'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { usePrefs } from '@/lib/prefs'
import { useWatchLater } from '@/lib/watch-later'

/**
 * The phone's bottom tab bar.
 *
 * This is the single biggest thing that makes an app read as native rather than
 * as a website: primary navigation within thumb reach, fixed, always there.
 * YouTube's is Home / Shorts / Create / Subscriptions / You; MeeTube has no
 * Shorts by design and can't upload, so the four that mean anything here are
 * Home, Search, Saved and You.
 *
 * Hidden from `md` up, where the app bar carries the same destinations.
 */
export function BottomDock() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { saved } = useWatchLater()
  const [accountOpen, setAccountOpen] = React.useState(false)

  const showingSaved = pathname === '/' && searchParams.get('view') === 'saved'
  const onHome = pathname === '/' && !showingSaved

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background pb-safe-b md:hidden"
      >
        <ul className="flex h-dock items-stretch">
          <DockItem href="/" active={onHome} icon={Home} label="Home" />
          <DockItem onClick={openSearchOverlay} icon={Search} label="Search" />
          <DockItem
            href="/?view=saved"
            active={showingSaved}
            icon={Bookmark}
            label="Saved"
            badge={saved.length}
          />
          <DockItem onClick={() => setAccountOpen(true)} icon={User} label="You" />
        </ul>
      </nav>

      <AccountSheet open={accountOpen} onOpenChange={setAccountOpen} />
    </>
  )
}

type DockItemProps = {
  icon: LucideIcon
  label: string
  href?: string
  onClick?: () => void
  active?: boolean
  badge?: number
}

function DockItem({ icon: Icon, label, href, onClick, active = false, badge }: DockItemProps) {
  const content = (
    <>
      <span className="relative">
        {/* Heavier stroke on the active tab stands in for YouTube's filled icon. */}
        <Icon className="h-6 w-6" strokeWidth={active ? 2.4 : 1.75} />

        {badge && badge > 0 ? (
          <span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-brand px-1 text-[10px] font-medium leading-4 text-white tabular-nums">
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </span>

      <span className={cn('text-[10px] leading-none', active ? 'font-medium' : 'font-normal')}>
        {label}
      </span>
    </>
  )

  const className = cn(
    'flex h-full w-full flex-col items-center justify-center gap-1 active:bg-accent/50',
    active ? 'text-foreground' : 'text-muted-foreground',
  )

  return (
    <li className="flex-1">
      {href ? (
        <Link href={href} className={className} aria-current={active ? 'page' : undefined}>
          {content}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={className}>
          {content}
        </button>
      )}
    </li>
  )
}

/**
 * What the "You" tab opens: the account, the two behaviour toggles, and the legal
 * links. The footer that holds those links on desktop is hidden on a phone
 * because the dock covers it, so they have to be reachable from here — YouTube's
 * API Services Terms require the privacy policy to be reachable without signing
 * in, and this is that route.
 */
function AccountSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: session, status } = useSession()
  const { prefs, set: setPrefs } = usePrefs()

  const linked = Boolean(session)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="sr-only">You</DialogTitle>
        </DialogHeader>

        {status === 'loading' ? null : linked ? (
          <div className="flex items-center gap-3">
            <Avatar name={session?.user?.name} email={session?.user?.email} size={44} />
            <div className="min-w-0">
              <p className="truncate text-base font-medium">{session?.user?.name ?? 'Account'}</p>
              <p className="truncate text-sm text-muted-foreground">{session?.user?.email}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted">
              <User className="h-5 w-5 text-muted-foreground" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-base font-medium">Not signed in</p>
              <p className="text-sm text-muted-foreground">
                Link YouTube for a feed from your subscriptions.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-1 border-t pt-3">
          <SheetToggle
            label="Autoplay next video"
            hint="Plays the next upload from the channel when one ends."
            checked={prefs.autoplayNext}
            onChange={(checked) => setPrefs({ autoplayNext: checked })}
          />
          <SheetToggle
            label="Load more as I scroll"
            hint="Off by default — each auto-loaded page costs a full search."
            checked={prefs.autoLoad}
            onChange={(checked) => setPrefs({ autoLoad: checked })}
          />
          <SheetToggle
            label="Keep screen on while watching"
            hint="Stops the phone locking mid-video. Uses more battery, and only applies on the watch page."
            checked={prefs.keepScreenOn}
            onChange={(checked) => setPrefs({ keepScreenOn: checked })}
          />
        </div>

        <div className="flex flex-col gap-1 border-t pt-3 text-sm">
          <Link
            href="/history"
            onClick={() => onOpenChange(false)}
            className="flex items-center gap-3 rounded-lg px-1 py-2.5 active:bg-accent"
          >
            <History className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            Watch history
          </Link>
          <Link
            href="/privacy"
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-1 py-2.5 active:bg-accent"
          >
            Privacy policy
          </Link>
          <a
            href="https://www.youtube.com/t/terms"
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-lg px-1 py-2.5 active:bg-accent"
          >
            YouTube Terms of Service
          </a>
          <a
            href="https://github.com/Juntakk/meetube"
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-lg px-1 py-2.5 active:bg-accent"
          >
            Source code
          </a>
        </div>

        {linked ? (
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false)
              signOut()
            }}
          >
            <LogOut />
            Unlink YouTube
          </Button>
        ) : (
          <Button
            onClick={() => {
              onOpenChange(false)
              signIn('google')
            }}
          >
            <LogIn />
            Link YouTube
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}

function SheetToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg px-1 py-2 active:bg-accent">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  )
}
