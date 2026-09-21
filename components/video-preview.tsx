'use client'

import * as React from 'react'

/**
 * Short rather than zero — a mouse gliding across a row of thumbnails on its
 * way elsewhere still shouldn't spin up an embed for every card it crosses.
 */
const HOVER_DELAY_MS = 100

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
 * row and mute badge over the video on every autoplay start — that chrome
 * isn't gated by the controls param at all, and since this remounts a fresh
 * iframe on every hover rather than reusing one, that startup chrome is what
 * most hovers actually see, not a brief flash that's already faded by the
 * time anyone's looking. `scale-125` didn't crop enough of it out at a feed
 * thumbnail's small size; this is a bigger margin, not a guaranteed fix —
 * YouTube doesn't publish where this chrome sits or how large it renders, so
 * there's no scale that's provably enough, only one that crops more. The
 * parent card is sized in `aspect-video`, so a uniform scale keeps the crop
 * proportional at any card width.
 */
export function VideoPreviewFrame({ videoId }: VideoPreviewFrameProps) {
  return (
    <iframe
      src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&modestbranding=1&playsinline=1&rel=0&loop=1&playlist=${videoId}&disablekb=1&iv_load_policy=3&fs=0`}
      title=""
      tabIndex={-1}
      aria-hidden
      allow="autoplay; encrypted-media"
      className="pointer-events-none absolute inset-0 h-full w-full scale-[1.6]"
    />
  )
}
