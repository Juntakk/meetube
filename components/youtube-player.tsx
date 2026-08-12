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
  playVideo?: () => void
}

type PlayerApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string
      playerVars?: Record<string, string | number>
      events?: {
        onReady?: (event: { target: Player }) => void
        onStateChange?: (event: PlayerEvent) => void
      }
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

/**
 * How often to move the progress bar while playing.
 *
 * Separate from POLL_MS on purpose: this only touches local state, so it can be
 * fast, while persisting stays slow because every write notifies the whole up-next
 * list. Half a second is smooth enough for a 3px bar and cheap enough to ignore.
 */
const TICK_MS = 500

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

  /**
   * 0–1 of the way through, for the progress bar. Local display state only — the
   * position that gets *saved* goes through onProgress on a much slower cadence.
   */
  const [played, setPlayed] = React.useState(0)

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

    // Autoplay-next keeps this component mounted and only changes videoId, so the
    // previous video's position would otherwise carry over to the new one's bar.
    setPlayed(0)

    let cancelled = false
    let player: Player | undefined
    let timer: ReturnType<typeof setInterval> | undefined
    let tick: ReturnType<typeof setInterval> | undefined

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

    /** Reads the clock for the bar. Cheap, and never persists anything. */
    const paint = () => {
      try {
        const seconds = player?.getCurrentTime?.()
        const duration = player?.getDuration?.()

        if (typeof seconds !== 'number' || typeof duration !== 'number') return
        if (!Number.isFinite(seconds) || duration <= 0) return

        setPlayed(Math.min(1, Math.max(0, seconds / duration)))
      } catch {
        // Same as report: the getters throw once the iframe is gone.
      }
    }

    const stopTimer = () => {
      if (timer) clearInterval(timer)
      timer = undefined
      if (tick) clearInterval(tick)
      tick = undefined
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
          /*
           * `autoplay: 1` alone is enough on desktop but not on a phone, where the
           * gesture that opened the video was spent on the navigation and is gone
           * by the time this iframe exists. Asking explicitly here is what gets
           * Android Chrome to start (it allows autoplay once a site has enough
           * media-engagement history). iOS Safari refuses either way and shows its
           * play button — no API can override that, so it isn't worth faking with
           * muted playback.
           */
          onReady: (event) => {
            // Resuming starts partway in, so the bar needs its offset before the
            // first tick rather than sitting at zero for half a second.
            paint()

            try {
              event.target.playVideo?.()
            } catch {
              // Blocked by the autoplay policy. The player's own button remains.
            }
          },

          onStateChange: (event) => {
            if (event.data === PLAYING) {
              stopTimer()
              timer = setInterval(report, POLL_MS)
              tick = setInterval(paint, TICK_MS)
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
            // Once more after stopping, so a seek or a pause lands on the bar
            // immediately rather than waiting for playback to resume.
            paint()

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
    // Edge to edge on a phone, as in the app; a rounded tile once the sidebar
    // appears beside it.
    <div className="relative aspect-video w-full overflow-hidden bg-black md:rounded-xl">
      {/*
        The host is kept empty of React children on purpose. The IFrame API
        replaces the node it is handed, and cleanup calls host.replaceChildren() —
        anything React rendered in here would be torn out from under it.
      */}
      <div ref={hostRef} title={title} className="h-full w-full" />

      {/*
        The ambient progress line, as the YouTube app shows under a player whose
        controls have faded. pointer-events-none so it never intercepts a tap
        meant for the player beneath it.
      */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-white/20"
        role="progressbar"
        aria-label="Playback progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(played * 100)}
      >
        {/*
          Transition matched to TICK_MS and linear, so the bar glides between
          samples instead of stepping twice a second.
        */}
        <div
          className="h-full bg-brand transition-[width] duration-500 ease-linear"
          style={{ width: `${played * 100}%` }}
        />
      </div>
    </div>
  )
}
