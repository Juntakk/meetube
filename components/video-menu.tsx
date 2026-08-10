'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Bookmark, BookmarkCheck, ExternalLink, Share2, User, type LucideIcon } from 'lucide-react'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useWatchLater } from '@/lib/watch-later'
import type { VideoResult } from '@/lib/youtube'

/**
 * The ⋮ overflow menu on a feed item.
 *
 * One instance for the whole page rather than one per card: a 24-item feed would
 * otherwise carry 24 dialogs' worth of state and 24 subscriptions to the saved
 * list. The open request travels as a window event, the same way the quota meter
 * receives its updates.
 */

const OPEN_EVENT = 'meetube:video-menu'

export function openVideoMenu(video: VideoResult) {
  window.dispatchEvent(new CustomEvent<VideoResult>(OPEN_EVENT, { detail: video }))
}

export function VideoMenu() {
  const router = useRouter()
  const { savedIds, toggle } = useWatchLater()
  const [video, setVideo] = React.useState<VideoResult | null>(null)

  React.useEffect(() => {
    const onOpen = (event: Event) => setVideo((event as CustomEvent<VideoResult>).detail)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  const close = () => setVideo(null)

  if (!video) return null

  const isSaved = savedIds.has(video.id)
  const watchUrl = `https://www.youtube.com/watch?v=${video.id}`

  const share = async () => {
    const url = `${window.location.origin}/watch?v=${video.id}`

    try {
      // The real share sheet where there is one — iOS and Android both have it.
      if (navigator.share) {
        await navigator.share({ title: video.title, url })
      } else {
        await navigator.clipboard.writeText(url)
      }
    } catch {
      // Cancelled, or clipboard blocked. Nothing worth interrupting for.
    }

    close()
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : close())}>
      <DialogContent className="gap-1 sm:max-w-sm" showCloseButton={false}>
        <DialogHeader className="px-1 pb-1">
          <DialogTitle className="line-clamp-2 text-sm font-normal text-muted-foreground">
            {video.title}
          </DialogTitle>
        </DialogHeader>

        <MenuItem
          icon={isSaved ? BookmarkCheck : Bookmark}
          label={isSaved ? 'Remove from Saved' : 'Save to Saved'}
          onClick={() => {
            toggle(video)
            close()
          }}
        />

        <MenuItem
          icon={User}
          label={`Go to ${video.channelTitle}`}
          onClick={() => {
            close()
            router.push(`/channel/${video.channelId}`)
          }}
        />

        <MenuItem icon={Share2} label="Share" onClick={share} />

        <MenuItem
          icon={ExternalLink}
          label="Open on YouTube"
          onClick={() => {
            window.open(watchUrl, '_blank', 'noopener,noreferrer')
            close()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // 48px rows: the height a list item needs before it stops being fiddly.
      className="flex min-h-12 w-full items-center gap-4 rounded-lg px-1 text-left text-sm active:bg-accent md:hover:bg-accent"
    >
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  )
}
