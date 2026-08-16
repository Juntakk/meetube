'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

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
   * Where playback is, for the bar and its time readout. Local display state only
   * — the position that gets *saved* goes through onProgress on a slower cadence.
   */
  const [clock, setClock] = React.useState({ seconds: 0, duration: 0 })

  /**
   * True while YouTube's own control bar is on screen, which is the one time our
   * line must not be: two red progress lines an inch apart is the thing this
   * whole piece of state exists to prevent.
   */
  const [controlsShowing, setControlsShowing] = React.useState(false)

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

  /*
   * Detecting a tap or click *inside* the player.
   *
   * A cross-origin iframe gives the page almost nothing: no mousemove, no click,
   * no way to ask whether its controls are visible. The one signal it does leak is
   * focus — clicking or tapping into the frame moves document.activeElement to the
   * iframe element and fires blur on our window. That is enough to know YouTube's
   * controls just came up, which is all we need in order to get out of their way.
   *
   * Hover is handled separately on the wrapper below, since mouseenter/mouseleave
   * still fire at the element's boundary even though movement inside it doesn't.
   */
  React.useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | undefined

    const onBlur = () => {
      if (!hostRef.current?.contains(document.activeElement)) return

      setControlsShowing(true)

      /*
       * A touch has no mouseleave to end it, so this falls back to YouTube's own
       * auto-hide timing. Slightly generous: showing our line a moment late is
       * invisible, showing it a moment early is the doubled bar we're avoiding.
       */
      clearTimeout(hideTimer)
      hideTimer = setTimeout(() => setControlsShowing(false), 4000)
    }

    window.addEventListener('blur', onBlur)

    return () => {
      window.removeEventListener('blur', onBlur)
      clearTimeout(hideTimer)
    }
  }, [])

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // Autoplay-next keeps this component mounted and only changes videoId, so the
    // previous video's position would otherwise carry over to the new one's bar.
    setClock({ seconds: 0, duration: 0 })
    setControlsShowing(false)

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

        setClock({ seconds, duration })
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

  const fraction = clock.duration > 0 ? Math.min(1, Math.max(0, clock.seconds / clock.duration)) : 0

  /** Ours is only ever on screen when YouTube's is not. */
  const showOurBar = !controlsShowing && clock.duration > 0

  return (
    // Edge to edge on a phone, as in the app; a rounded tile once the sidebar
    // appears beside it.
    <div
      className="relative aspect-video w-full overflow-hidden bg-black md:rounded-xl"
      // Hovering the player is enough to raise YouTube's controls, so it is also
      // enough to stand ours down — no click required.
      onMouseEnter={() => setControlsShowing(true)}
      onMouseLeave={() => setControlsShowing(false)}
    >
      {/*
        The host is kept empty of React children on purpose. The IFrame API
        replaces the node it is handed, and cleanup calls host.replaceChildren() —
        anything React rendered in here would be torn out from under it.
      */}
      <div ref={hostRef} title={title} className="h-full w-full" />

      {/*
        The ambient progress line, matched to what YouTube actually does.

        Three things about that are worth stating, because each one is a
        deliberate absence rather than an oversight:

         - **No time readout.** YouTube shows elapsed/total only inside the full
           control bar. The ambient line carries no text at all.
         - **Phone widths only.** The YouTube app and m.youtube.com keep this line
           after the controls fade; youtube.com on desktop fades the progress bar
           out *with* the controls and leaves the video clean. So this is hidden
           from md up, where the control bar is the only thing that should appear.
         - **No scrim.** The gradient belongs to the control bar. A bare 2px line
           is what remains once that has gone.

        Hidden the instant YouTube's own controls appear, so the two can never
        both be on screen. pointer-events-none so it can't take a tap meant for
        the player beneath it.
      */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-white/20 transition-opacity duration-200 md:hidden',
          showOurBar ? 'opacity-100' : 'opacity-0',
        )}
        role="progressbar"
        aria-label="Playback progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
      >
        {/*
          Transition matched to TICK_MS and linear, so the bar glides between
          samples instead of stepping twice a second.
        */}
        <div
          className="h-full bg-brand transition-[width] duration-500 ease-linear"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
    </div>
  )
}
