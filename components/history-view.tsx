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
import { useWatchProgress } from '@/lib/watch-progress'

/**
 * Watch history: what you opened, newest first, with each card's red bar showing
 * how far you got. Tapping one resumes from there.
 *
 * Reads only from localStorage, so it costs no quota and works offline. Note the
 * list is bounded — see the size-budget note in lib/watch-progress.ts — and the
 * footer says so rather than letting it look like a complete record.
 */
export function HistoryView() {
  const { entries, remove, clear } = useWatchProgress()
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  return (
    <div className="mx-auto w-full max-w-6xl pb-8 sm:px-4">
      <div className="flex items-center justify-between gap-3 px-3 py-4 sm:px-0">
        <h1 className="text-xl font-medium sm:text-2xl">Watch history</h1>

        {entries.length > 0 ? (
          <Button variant="pill" size="pill" onClick={() => setConfirmOpen(true)}>
            <Trash2 />
            Clear all
          </Button>
        ) : null}
      </div>

      {entries.length === 0 ? (
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
            {entries.map((entry, index) => (
              <VideoCard
                key={entry.video.id}
                video={entry.video}
                priority={index < 2}
                onRemove={() => remove(entry.video.id)}
              />
            ))}
          </div>

          <p className="px-3 pt-6 text-xs text-muted-foreground sm:px-0">
            History is kept on this device only, and holds your {entries.length} most recent
            videos.
          </p>
        </>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear watch history?</DialogTitle>
            <DialogDescription>
              This removes all {entries.length} entries and every saved position, so part-watched
              videos start from the beginning again. It can&rsquo;t be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                clear()
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
