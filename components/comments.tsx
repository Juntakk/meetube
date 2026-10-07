'use client'

import * as React from 'react'
import Image from 'next/image'
import { AlertCircle, MessageSquareOff, ThumbsUp } from 'lucide-react'

import { Avatar } from '@/components/avatar'
import { publishQuota } from '@/components/quota-meter'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  formatCompactNumber,
  formatRelativeDate,
  type Comment,
  type CommentsResponse,
} from '@/lib/youtube'

type CommentsProps = {
  videoId: string
}

type Status = 'loading' | 'ready' | 'error'
type Order = 'relevance' | 'time'

/**
 * Top-level comments, youtube.com-style: avatar, author, relative time, the
 * comment itself, its like count, and a reply count shown as a plain number
 * rather than a nested fetch — see fetchComments in lib/youtube-server.ts for
 * why replies themselves aren't pulled. 1 unit per page, regardless of order
 * or how many come back.
 */
export function Comments({ videoId }: CommentsProps) {
  const [items, setItems] = React.useState<Comment[]>([])
  const [nextPageToken, setNextPageToken] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<Status>('loading')
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [disabled, setDisabled] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [order, setOrder] = React.useState<Order>('relevance')

  /*
   * Only reads `videoId` through its own argument, never through closure —
   * so this identity is stable across an order change, and the effect below
   * can list it as a dependency with no eslint-disable needed.
   */
  const load = React.useCallback(
    async (currentOrder: Order, pageToken?: string) => {
      if (pageToken) setLoadingMore(true)
      else setStatus('loading')
      setError(null)

      try {
        const params = new URLSearchParams({ v: videoId, order: currentOrder })
        if (pageToken) params.set('pageToken', pageToken)

        const response = await fetch(`/api/comments?${params}`)
        const data = (await response.json()) as CommentsResponse & { error?: string }

        publishQuota(data.quota)

        if (!response.ok) throw new Error(data.error || 'Could not load comments.')

        setDisabled(data.disabled)
        setNextPageToken(data.nextPageToken)
        setItems((current) => (pageToken ? [...current, ...data.items] : data.items))
        setStatus('ready')
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not load comments.')
        setStatus('error')
      } finally {
        setLoadingMore(false)
      }
    },
    [videoId],
  )

  React.useEffect(() => {
    void load(order)
  }, [load, order])

  if (status === 'loading') {
    return (
      <section className="mt-6 space-y-4">
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        {[0, 1, 2].map((key) => (
          <div key={key} className="flex gap-3">
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-full animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </section>
    )
  }

  if (status === 'error') {
    return (
      <section className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-6 py-8 text-center">
        <AlertCircle className="h-6 w-6 text-destructive" aria-hidden />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => load(order)}>
          Try again
        </Button>
      </section>
    )
  }

  if (disabled) {
    return (
      <section className="mt-6 flex flex-col items-center gap-2 rounded-xl bg-secondary/60 px-6 py-8 text-center">
        <MessageSquareOff className="h-6 w-6 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">Comments are turned off for this video.</p>
      </section>
    )
  }

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-2 pb-3">
        <h2 className="text-base font-medium">Comments</h2>

        <div className="flex shrink-0 overflow-hidden rounded-full border text-xs font-medium">
          <button
            type="button"
            aria-pressed={order === 'relevance'}
            onClick={() => setOrder('relevance')}
            className={cn(
              'px-3 py-1.5',
              order === 'relevance' ? 'bg-accent' : 'text-muted-foreground hover:bg-accent/50',
            )}
          >
            Top
          </button>
          <button
            type="button"
            aria-pressed={order === 'time'}
            onClick={() => setOrder('time')}
            className={cn(
              'px-3 py-1.5',
              order === 'time' ? 'bg-accent' : 'text-muted-foreground hover:bg-accent/50',
            )}
          >
            Newest
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No comments yet. Be the first — on YouTube itself, since posting isn&rsquo;t something
          this app can do.
        </p>
      ) : (
        <ul className="space-y-4">
          {items.map((comment) => (
            <li key={comment.id} className="flex gap-3">
              {comment.authorAvatar ? (
                <Image
                  src={comment.authorAvatar}
                  alt=""
                  width={36}
                  height={36}
                  className="h-9 w-9 shrink-0 rounded-full"
                />
              ) : (
                <Avatar name={comment.author} size={36} className="shrink-0" />
              )}

              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2 text-sm">
                  <span className="truncate font-medium">{comment.author}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatRelativeDate(comment.publishedAt)}
                  </span>
                </p>

                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{comment.text}</p>

                <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                  {comment.likeCount > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
                      {formatCompactNumber(comment.likeCount)}
                    </span>
                  ) : null}

                  {comment.replyCount > 0 ? (
                    <span>
                      {comment.replyCount} {comment.replyCount === 1 ? 'reply' : 'replies'} on
                      YouTube
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {nextPageToken ? (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={() => load(order, nextPageToken)}
          >
            {loadingMore ? 'Loading…' : 'Show more comments'}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
