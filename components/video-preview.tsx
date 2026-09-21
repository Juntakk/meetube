'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Short rather than zero — a mouse gliding across a row of thumbnails on its
 * way elsewhere still shouldn't spin up an embed for every card it crosses.
 */
const HOVER_DELAY_MS = 100

/**
 * How long the frame stays invisible after it starts loading, before it's
 * allowed to actually show. See VideoPreviewFrame's doc comment — this is
 * what hides YouTube's own play/pause icon flash and startup chrome, which a
 * crop can't reach because some of it (the icon) is centered, not at an edge.
 */
const REVEAL_DELAY_MS = 700

/**
 * Hover-to-preview, the way youtube.com does it on a grid or list thumbnail:
 * wait a beat, then swap the static thumbnail for a muted, looping embed of
 * the video itself. Mouse only — `pointerType` guards it off touch, where
 * there's no hover to begin with and a tap should just navigate.
 *
 * Meant to be spread onto the card's outermost element rather than the
 * thumbnail alone, so moving onto the save button or the channel link (both
 * separate elements stacked above the card's overlay link) still reads as
 * "still hovering the card" instead of cancelling the preview mid-glance.
 */
export function useHoverPreview() {
  const [previewing, setPreviewing] = React.useState(false)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const clear = React.useCallback(() => {
    clearTimeout(timerRef.current)
    timerRef.current = undefined
  }, [])

  React.useEffect(() => clear, [clear])

  const onPointerEnter = React.useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      clear()
      timerRef.current = setTimeout(() => setPreviewing(true), HOVER_DELAY_MS)
    },
    [clear],
  )

  const onPointerLeave = React.useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      clear()
      setPreviewing(false)
    },
    [clear],
  )

  return { previewing, handlers: { onPointerEnter, onPointerLeave } }
}

type VideoPreviewFrameProps = {
  videoId: string
}

/**
 * The preview itself: a bare, chromeless embed — not the app's own
 * PlayerControls stack, which would be a lot of machinery for something meant
 * to be glanced at and dismissed a second later.
 *
 * `pointer-events-none` so it never steals the click that's supposed to land
 * on the overlay link beneath it — hovering plays it, but tapping still
 * navigates to the real watch page. `loop=1` needs `playlist` set to the same
 * id to actually loop a single video; that's a documented quirk of the embed
 * API, not a typo.
 *
 * `controls=0` doesn't stop YouTube from drawing its own title bar, channel
 * row and mute badge over the video on every autoplay start, or the big
 * play/pause icon that fades in and out over the *center* of the frame on
 * every state change — none of that is gated by the controls param, and
 * since this remounts a fresh iframe on every hover rather than reusing one,
 * every hover restarts the same startup sequence rather than catching it
 * mid-fade. `scale-[1.6]` crops the edge chrome (title bar, channel row) but
 * can't touch the center icon — scaling around the center makes something
 * already centered bigger, not hidden.
 *
 * What actually hides the icon: the frame loads invisible and only fades in
 * once `REVEAL_DELAY_MS` has passed, so the flash plays out and fades on its
 * own, off-screen, before anyone's looking at it. Not a guaranteed fix — it's
 * a fixed delay standing in for an animation length YouTube doesn't publish
 * — but comfortably longer than the flash has ever taken to fade in
 * practice.
 */
export function VideoPreviewFrame({ videoId }: VideoPreviewFrameProps) {
  const [revealed, setRevealed] = React.useState(false)

  React.useEffect(() => {
    setRevealed(false)
    const timer = setTimeout(() => setRevealed(true), REVEAL_DELAY_MS)
    return () => clearTimeout(timer)
  }, [videoId])

  return (
    <iframe
      src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&modestbranding=1&playsinline=1&rel=0&loop=1&playlist=${videoId}&disablekb=1&iv_load_policy=3&fs=0`}
      title=""
      tabIndex={-1}
      aria-hidden
      allow="autoplay; encrypted-media"
      className={cn(
        'pointer-events-none absolute inset-0 h-full w-full scale-[1.6] transition-opacity duration-150',
        revealed ? 'opacity-100' : 'opacity-0',
      )}
    />
  )
}
