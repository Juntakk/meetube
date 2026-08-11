'use client'

import * as React from 'react'
import Link from 'next/link'
import { History, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { VideoCard } from '@/components/video-card'
import { useWatchHistory, type WatchEntry } from '@/lib/watch-history'
import { useWatchProgress } from '@/lib/watch-progress'
import { thumbnailUrl, type VideoResult } from '@/lib/youtube'

/**
 * Watch history: what you opened, newest first, with each card's red bar showing
 * how far you got. Tapping one resumes from there.
 *
 * Reads only from localStorage, so it costs no quota and works offline.
 *
 * Two sources, deliberately. `watch-progress` holds full snapshots and playback
 * positions but only for the last 40 videos; `watch-history` is the ranking signal
 * and remembers 120, with no snapshots at all. Showing only the first meant this
 * page read "Nothing watched yet" for anyone whose history predated positions
 * being recorded — so the older entries are reconstructed from what they do have.
 */
export function HistoryView() {
  const { entries, remove: removeProgress, clear: clearProgress } = useWatchProgress()
  const { history, remove: removeHistory, clear: clearHistory } = useWatchHistory()
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  const rows = React.useMemo(() => {
    const byId = new Map<string, { video: VideoResult; at: number }>()

    // Snapshots first, so they win the dedupe — they carry real metadata and a
    // position, where a reconstruction has neither.
    for (const entry of entries) {
      byId.set(entry.video.id, { video: entry.video, at: entry.at })
    }

    for (const entry of history) {
      if (byId.has(entry.id)) continue
      byId.set(entry.id, { video: reconstruct(entry), at: entry.at })
    }

    return [...byId.values()].sort((a, b) => b.at - a.at)
  }, [entries, history])

  /** Removes from whichever store holds it; the other call is a harmless no-op. */
  const removeRow = React.useCallback(
    (id: string) => {
      removeProgress(id)
      removeHistory(id)
    },
    [removeProgress, removeHistory],
  )

  return (
    <div className="mx-auto w-full max-w-6xl pb-8 sm:px-4">
      <div className="flex items-center justify-between gap-3 px-3 py-4 sm:px-0">
        <h1 className="text-xl font-medium sm:text-2xl">Watch history</h1>

        {rows.length > 0 ? (
          <Button variant="pill" size="pill" onClick={() => setConfirmOpen(true)}>
            <Trash2 />
            Clear all
          </Button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
          <History className="h-10 w-10 text-muted-foreground" aria-hidden />
          <p className="text-base font-medium">Nothing watched yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Videos you open show up here, and stopping halfway is fine — reopening one picks up
            where you left off.
          </p>
          <Button variant="pill" size="pill" asChild className="mt-1">
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-6 lg:grid-cols-3">
            {rows.map((row, index) => (
              <VideoCard
                key={row.video.id}
                video={row.video}
                priority={index < 2}
                onRemove={() => removeRow(row.video.id)}
              />
            ))}
          </div>

          <p className="px-3 pt-6 text-xs text-muted-foreground sm:px-0">
            Kept on this device only, and holds your {rows.length} most recent videos. Resume
            positions are stored for the last {entries.length}.
          </p>
        </>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear watch history?</DialogTitle>
            <DialogDescription>
              This removes all {rows.length} entries and every saved position, so part-watched
              videos start from the beginning again. Your recommendations will also reset, since
              they are built from what you&rsquo;ve watched. It can&rsquo;t be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                clearProgress()
                clearHistory()
                setConfirmOpen(false)
              }}
            >
              <Trash2 />
              Clear history
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * A renderable video from a ranking-signal entry, which stores only id, title and
 * channel.
 *
 * The thumbnail is derived from the id off YouTube's image CDN — free, no API call.
 * Everything genuinely unknown is left blank rather than guessed: the card drops
 * its duration badge and metadata line and shows title and channel, which is
 * honest. Filling `publishedAt` with the time you *watched* it would read as the
 * upload date and simply be wrong.
 */
function reconstruct(entry: WatchEntry): VideoResult {
  return {
    id: entry.id,
    title: entry.title,
    channelId: entry.channelId,
    channelTitle: entry.channelTitle,
    publishedAt: '',
    description: '',
    thumbnail: thumbnailUrl(entry.id),
    durationSeconds: 0,
    duration: '',
    viewCount: null,
    likeCount: null,
  }
}
