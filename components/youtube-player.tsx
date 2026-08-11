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
  getCurrentTime?: () => number
  getDuration?: () => number
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

/** YT.PlayerState values. Hard-coded so we don't have to wait for the enum. */
const ENDED = 0
const PLAYING = 1

/**
 * How often to persist the playback position while playing.
 *
 * Every write notifies every subscriber, and on the watch page that's the whole
 * up-next list — so this is deliberately slow, with the real precision coming
 * from the flushes on pause, finish, tab-hide and unmount. Fifteen seconds is the
 * most you can lose to a crash, which is well inside the rewind on resume.
 */
const POLL_MS = 15_000

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
  /**
   * Where to start, resolved at construction time rather than passed as a number.
   * The resume point lives in localStorage, and a prop would be one render behind
   * on the first paint after hydration — by which time `start` is already baked
   * into the player and can't be changed without rebuilding it.
   */
  getStartSeconds?: (videoId: string) => number
  /**
   * Playback position, reported periodically and on every stop. Carries the id it
   * belongs to: on autoplay-next the parent's idea of "current video" changes
   * before this player is torn down, so a report without one can be filed against
   * the wrong video.
   */
  onProgress?: (videoId: string, seconds: number, duration: number) => void
}

export function YouTubePlayer({
  videoId,
  title,
  onEnded,
  getStartSeconds,
  onProgress,
}: YouTubePlayerProps) {
  const hostRef = React.useRef<HTMLDivElement | null>(null)

  /*
   * Held in refs and read at fire time so that changing a handler — which
   * happens whenever the sidebar re-renders with a different "next" video —
   * doesn't tear down and rebuild the player mid-playback.
   */
  const onEndedRef = React.useRef(onEnded)
  onEndedRef.current = onEnded

  const onProgressRef = React.useRef(onProgress)
  onProgressRef.current = onProgress

  const getStartRef = React.useRef(getStartSeconds)
  getStartRef.current = getStartSeconds

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let cancelled = false
    let player: Player | undefined
    let timer: ReturnType<typeof setInterval> | undefined

    /*
     * The API *replaces* the element it's given with an iframe, so it gets a
     * node created outside React's tree. Handing it a JSX-rendered div would
     * mean React later trying to remove a node that no longer exists.
     */
    const target = document.createElement('div')
    target.className = 'h-full w-full'
    host.appendChild(target)

    const report = () => {
      try {
        const seconds = player?.getCurrentTime?.()
        const duration = player?.getDuration?.()

        if (typeof seconds !== 'number' || typeof duration !== 'number') return
        if (!Number.isFinite(seconds) || duration <= 0) return

        onProgressRef.current?.(videoId, seconds, duration)
      } catch {
        // The getters throw once the iframe is gone. Nothing left to save.
      }
    }

    const stopTimer = () => {
      if (timer) clearInterval(timer)
      timer = undefined
    }

    // Locking the screen or switching apps is the most common way a watch ends,
    // and neither fires unload — so both are treated as a stop worth saving.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') report()
    }

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
          // 0 is the same as omitting it, so no branch is needed here.
          start: getStartRef.current?.(videoId) ?? 0,
        },
        events: {
          onStateChange: (event) => {
            if (event.data === PLAYING) {
              stopTimer()
              timer = setInterval(report, POLL_MS)
              return
            }

            /*
             * Anything that isn't playing is a stop: paused, buffering after a
             * seek, or finished. Save the position, then let the parent know if
             * it was the end — in that order, so the entry is already marked
             * finished by the time autoplay navigates away from it.
             */
            stopTimer()
            report()

            if (event.data === ENDED) onEndedRef.current?.()
          },
        },
      })
    })

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', report)

    return () => {
      cancelled = true
      stopTimer()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', report)

      // Before destroy, not after: the getters stop working with the iframe.
      report()

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
