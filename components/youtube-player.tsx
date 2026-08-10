'use client'

import * as React from 'react'

/**
 * The embedded player, driven through YouTube's IFrame Player API rather than a
 * plain `<iframe>`.
 *
 * A bare iframe can't tell us anything about what it's doing, so there is no way
 * to know a video finished — which is the one event autoplay-next depends on.
 * The API costs no quota: it's the public player, not the Data API.
 */

type PlayerEvent = { data: number }

type Player = {
  destroy?: () => void
}

type PlayerApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string
      playerVars?: Record<string, string | number>
      events?: { onStateChange?: (event: PlayerEvent) => void }
    },
  ) => Player
}

declare global {
  interface Window {
    YT?: PlayerApi
    onYouTubeIframeAPIReady?: () => void
  }
}

/** YT.PlayerState.ENDED. Hard-coded so we don't have to wait for the enum. */
const ENDED = 0

let apiPromise: Promise<void> | null = null

/**
 * Loads the API script once per page, however many players mount.
 *
 * `onYouTubeIframeAPIReady` is a single global callback, so any existing one is
 * chained rather than overwritten — otherwise a second player racing the first
 * would silently unhook it.
 */
function loadPlayerApi(): Promise<void> {
  if (apiPromise) return apiPromise

  apiPromise = new Promise<void>((resolve) => {
    if (window.YT?.Player) {
      resolve()
      return
    }

    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve()
    }

    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    document.head.appendChild(script)
  })

  return apiPromise
}

type YouTubePlayerProps = {
  videoId: string
  title: string
  onEnded?: () => void
}

export function YouTubePlayer({ videoId, title, onEnded }: YouTubePlayerProps) {
  const hostRef = React.useRef<HTMLDivElement | null>(null)

  /*
   * Held in a ref and read at fire time so that changing the handler — which
   * happens whenever the sidebar re-renders with a different "next" video —
   * doesn't tear down and rebuild the player mid-playback.
   */
  const onEndedRef = React.useRef(onEnded)
  onEndedRef.current = onEnded

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let cancelled = false
    let player: Player | undefined

    /*
     * The API *replaces* the element it's given with an iframe, so it gets a
     * node created outside React's tree. Handing it a JSX-rendered div would
     * mean React later trying to remove a node that no longer exists.
     */
    const target = document.createElement('div')
    target.className = 'h-full w-full'
    host.appendChild(target)

    void loadPlayerApi().then(() => {
      if (cancelled || !window.YT) return

      player = new window.YT.Player(target, {
        videoId,
        playerVars: {
          autoplay: 1,
          rel: 0,
          modestbranding: 1,
          // Without this iOS Safari takes the video fullscreen on play.
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onStateChange: (event) => {
            if (event.data === ENDED) onEndedRef.current?.()
          },
        },
      })
    })

    return () => {
      cancelled = true
      player?.destroy?.()
      // destroy() removes the iframe, but only if the player got as far as
      // being constructed; clearing the host covers the cancelled case too.
      host.replaceChildren()
    }
  }, [videoId])

  return (
    <div
      ref={hostRef}
      title={title}
      // Edge to edge on a phone, as in the app; a rounded tile once the sidebar
      // appears beside it.
      className="aspect-video w-full overflow-hidden bg-black md:rounded-xl"
    />
  )
}
