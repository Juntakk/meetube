'use client'

import { ExternalLink } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatRelativeDate, type VideoResult } from '@/lib/youtube'

type VideoDialogProps = {
  video: VideoResult | null
  onOpenChange: (open: boolean) => void
}

export function VideoDialog({ video, onOpenChange }: VideoDialogProps) {
  return (
    <Dialog open={Boolean(video)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0 sm:rounded-lg">
        {video ? (
          <>
            <div className="aspect-video w-full bg-black">
              {/*
                key forces a fresh iframe per video so the player never keeps
                playing the previous one when the dialog is reused.
              */}
              <iframe
                key={video.id}
                src={`https://www.youtube.com/embed/${video.id}?autoplay=1&rel=0`}
                title={video.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>

            <DialogHeader className="space-y-2 p-4 text-left">
              <DialogTitle className="text-base leading-snug">{video.title}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span>{video.channelTitle}</span>
                <span aria-hidden>&middot;</span>
                <span>{video.duration}</span>
                <span aria-hidden>&middot;</span>
                <span>{formatRelativeDate(video.publishedAt)}</span>
              </DialogDescription>

              <a
                href={`https://www.youtube.com/watch?v=${video.id}`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open on YouTube
              </a>
            </DialogHeader>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
