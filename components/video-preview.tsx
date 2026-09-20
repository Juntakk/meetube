'use client'

import * as React from 'react'

/** Long enough that a mouse merely passing through the grid never triggers it. */
const HOVER_DELAY_MS = 600

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
 */
export function VideoPreviewFrame({ videoId }: VideoPreviewFrameProps) {
  return (
    <iframe
      src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&modestbranding=1&playsinline=1&rel=0&loop=1&playlist=${videoId}`}
      title=""
      tabIndex={-1}
      aria-hidden
      allow="autoplay; encrypted-media"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  )
}
