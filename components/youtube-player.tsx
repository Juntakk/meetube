'use client'

import * as React from 'react'

import { ChevronsLeft, ChevronsRight } from 'lucide-react'

import { PlayerControls, type ControllablePlayer } from '@/components/player-controls'
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

type Player = ControllablePlayer & {
  destroy?: () => void
  getCurrentTime?: () => number
  getDuration?: () => number
  getPlayerState?: () => number
  /** 0–1 downloaded, for the lighter track behind the scrubber's red fill. */
  getVideoLoadedFraction?: () => number
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

/** YouTube's own step, and roughly its own double-tap window. */
const SEEK_STEP_SECONDS = 10
const DOUBLE_TAP_MS = 300

/**
 * How long the seek indicator stays up after the last tap.
 *
 * Doubles as the accumulation window: further taps on the same side while it is
 * visible add another 10s each, which is what makes repeated tapping scrub in
 * big jumps rather than replaying the same 10s over and over.
 */
const SEEK_FLASH_MS = 800

/** How long the bar stays up after the last pointer movement, while playing. */
const IDLE_HIDE_MS = 3000

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
  const [clock, setClock] = React.useState({ seconds: 0, duration: 0, buffered: 0 })

  const [playing, setPlaying] = React.useState(false)

  /** Our bar's visibility, which we now own outright rather than inferring. */
  const [controlsVisible, setControlsVisible] = React.useState(true)

  /** Set while a menu or a drag is in progress, which must outlast the idle timer. */
  const busyRef = React.useRef(false)
  const idleTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const containerRef = React.useRef<HTMLDivElement | null>(null)

  /**
   * The live player, held two ways on purpose.
   *
   * The ref is for imperative handlers, which must never read a stale instance.
   * The state is for the control bar, which has to *re-render* when the player
   * appears — a ref assignment alone would leave the bar holding `undefined`
   * until something unrelated happened to re-render it.
   */
  const playerRef = React.useRef<Player | undefined>(undefined)
  const [player, setPlayer] = React.useState<Player | undefined>(undefined)

  /**
   * The seek indicator: which side, and how much has accumulated on it.
   * null when nothing is showing.
   */
  const [seekFlash, setSeekFlash] = React.useState<{
    side: 'left' | 'right'
    seconds: number
  } | null>(null)

  /** Last tap, for telling a double-tap from two unrelated single taps. */
  const lastTapRef = React.useRef<{ at: number; side: 'left' | 'right' } | null>(null)
  const flashTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const singleTapTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

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
   * Show the bar, then hide it again after a few idle seconds — but only while
   * playing. A paused player keeps its controls up, as YouTube's does: there is
   * nothing to get out of the way of.
   *
   * With `controls: 0` we finally get real pointer events over the player, since
   * nothing inside the iframe needs them any more. That is what makes an honest
   * hover/idle model possible where before we were sniffing window blur.
   */
  const revealControls = React.useCallback(() => {
    setControlsVisible(true)
    clearTimeout(idleTimerRef.current)

    if (!playing || busyRef.current) return

    idleTimerRef.current = setTimeout(() => {
      if (!busyRef.current) setControlsVisible(false)
    }, IDLE_HIDE_MS)
  }, [playing])

  // Re-arm whenever playback starts or stops, so pausing pins the bar open.
  React.useEffect(() => {
    revealControls()
    return () => clearTimeout(idleTimerRef.current)
  }, [revealControls])

  const setBusy = React.useCallback(
    (busy: boolean) => {
      busyRef.current = busy
      if (!busy) revealControls()
      else {
        clearTimeout(idleTimerRef.current)
        setControlsVisible(true)
      }
    },
    [revealControls],
  )

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // Autoplay-next keeps this component mounted and only changes videoId, so the
    // previous video's position would otherwise carry over to the new one's bar.
    setClock({ seconds: 0, duration: 0, buffered: 0 })
    setPlaying(false)

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

        setClock({ seconds, duration, buffered: player?.getVideoLoadedFraction?.() ?? 0 })
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
          /*
           * YouTube's own chrome off, because the /embed/ player ships the older
           * full-width control bar and no parameter switches it to the watch-page
           * design. Everything visible is ours now — see PlayerControls.
           *
           * (`modestbranding` used to live here. YouTube has ignored it since
           * August 2023, so it was only implying control we never had.)
           */
          controls: 0,
          // No annotation cards floating over our bar.
          iv_load_policy: 3,
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
            // Held for the tap gestures, which live outside this effect. Set on
            // ready rather than on construction: before that the instance exists
            // but its methods are not yet safe to call.
            playerRef.current = event.target
            setPlayer(event.target)

            /*
             * Ask for the captions module so a tracklist exists to read later.
             * Both names on purpose: 'captions' is the old AS3 player's, 'cc' the
             * HTML5 one's, and which one answers has varied over the years. The
             * wrong name is a no-op, so trying both is cheaper than guessing.
             */
            for (const captionModule of ['captions', 'cc']) {
              try {
                event.target.loadModule?.(captionModule)
              } catch {
                // Not supported by this player build. The CC button stays hidden.
              }
            }

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
            setPlaying(event.data === PLAYING)

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

      playerRef.current = undefined
      setPlayer(undefined)
      player?.destroy?.()
      // destroy() removes the iframe, but only if the player got as far as
      // being constructed; clearing the host covers the cancelled case too.
      host.replaceChildren()
    }
  }, [videoId])

  /*
   * Double-tap to seek, as the YouTube app does it.
   *
   * The overlay zones exist because a cross-origin iframe hands us no taps at all
   * — the only way to know a side of the video was tapped is to put something of
   * ours over it. That has a cost, spelled out where the zones are rendered.
   */
  const clearTimers = React.useCallback(() => {
    clearTimeout(flashTimerRef.current)
    clearTimeout(singleTapTimerRef.current)
  }, [])

  React.useEffect(() => clearTimers, [clearTimers])

  const seekBy = React.useCallback((side: 'left' | 'right') => {
    const player = playerRef.current
    if (!player?.seekTo || !player.getCurrentTime || !player.getDuration) return

    const duration = player.getDuration()
    const current = player.getCurrentTime()
    if (!Number.isFinite(current) || !(duration > 0)) return

    /*
     * Accumulate while the indicator is up: a third tap means 20s, a fourth 30s.
     * Read off the flash rather than a separate counter so the number on screen
     * and the number seeked by cannot drift apart.
     */
    setSeekFlash((previous) => {
      const carried = previous?.side === side ? previous.seconds : 0
      return { side, seconds: carried + SEEK_STEP_SECONDS }
    })

    const delta = side === 'left' ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS
    const target = Math.min(duration, Math.max(0, current + delta))

    player.seekTo(target, true)
    // Move the bar now: the next paint tick is up to half a second away.
    setClock((previous) => ({ ...previous, seconds: target, duration }))

    clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setSeekFlash(null), SEEK_FLASH_MS)
  }, [])

  const handleZoneTap = React.useCallback(
    (side: 'left' | 'right') => {
      const now = Date.now()
      const last = lastTapRef.current
      const isDouble = last !== null && last.side === side && now - last.at < DOUBLE_TAP_MS

      // Already accumulating on this side, so every further tap is a seek.
      if (isDouble || seekFlash?.side === side) {
        lastTapRef.current = null
        clearTimeout(singleTapTimerRef.current)
        seekBy(side)
        return
      }

      lastTapRef.current = { at: now, side }

      /*
       * A lone tap toggles playback once the double-tap window has passed. This is
       * the one place the overlay forces a deviation: YouTube would raise its
       * controls here, and no API can ask it to. Play/pause is the most useful
       * thing left, and it beats a zone that swallows taps and does nothing.
       */
      clearTimeout(singleTapTimerRef.current)
      singleTapTimerRef.current = setTimeout(() => {
        const player = playerRef.current
        if (!player) return

        // 1 is PLAYING; anything else is treated as "not currently playing".
        if (player.getPlayerState?.() === PLAYING) player.pauseVideo?.()
        else player.playVideo?.()
      }, DOUBLE_TAP_MS)
    },
    [seekBy, seekFlash],
  )

  const togglePlay = React.useCallback(() => {
    const player = playerRef.current
    if (!player) return

    if (player.getPlayerState?.() === PLAYING) player.pauseVideo?.()
    else player.playVideo?.()
  }, [])

  return (
    // Edge to edge on a phone, as in the app; a rounded tile once the sidebar
    // appears beside it. Also the element that goes fullscreen.
    <div
      ref={containerRef}
      tabIndex={-1}
      className="group/player relative aspect-video w-full overflow-hidden bg-black focus:outline-none md:rounded-xl"
      onPointerMove={revealControls}
      // Touch produces no hover, so a tap is what raises the bar there.
      onPointerDown={revealControls}
      onPointerLeave={() => {
        // Leaving with the video playing hides immediately; paused stays pinned.
        if (playing && !busyRef.current) setControlsVisible(false)
      }}
      /*
       * The shortcuts YouTube binds. They used to be handled inside the iframe,
       * which no longer receives keys now that its own chrome is off.
       */
      onKeyDown={(event) => {
        const player = playerRef.current
        if (!player) return

        const key = event.key.toLowerCase()
        const handled = [' ', 'k', 'j', 'l', 'arrowleft', 'arrowright', 'm', 'f'].includes(key)
        if (!handled) return

        event.preventDefault()
        revealControls()

        const at = player.getCurrentTime?.() ?? 0
        const total = player.getDuration?.() ?? 0
        const seek = (delta: number) =>
          player.seekTo?.(Math.min(total, Math.max(0, at + delta)), true)

        if (key === ' ' || key === 'k') togglePlay()
        else if (key === 'arrowleft') seek(-5)
        else if (key === 'arrowright') seek(5)
        else if (key === 'j') seek(-10)
        else if (key === 'l') seek(10)
        else if (key === 'm') (player.isMuted?.() ? player.unMute : player.mute)?.call(player)
        else if (key === 'f') containerRef.current?.requestFullscreen?.()
      }}
    >
      {/*
        The host is kept empty of React children on purpose. The IFrame API
        replaces the node it is handed, and cleanup calls host.replaceChildren() —
        anything React rendered in here would be torn out from under it.
      */}
      <div ref={hostRef} title={title} className="h-full w-full" />

      {/*
        The interaction layer. With YouTube's chrome off, nothing inside the iframe
        wants pointer events any more, so this can cover the whole player: a click
        anywhere plays or pauses, and the two outer quarters take the double-tap
        seek on touch. The control bar sits above this and stops propagation, so
        pressing a button never also toggles playback.
      */}
      <div
        className="absolute inset-0 z-10 flex"
        /*
         * If the bar is down, a press only brings it back; playback toggles on the
         * press after that. On a mouse that reads as plain click-to-pause, because
         * hovering has already raised the bar. On touch it gives you the app's
         * behaviour: one tap to look, another to act.
         */
        onClick={() => {
          if (!controlsVisible) {
            revealControls()
            return
          }
          togglePlay()
        }}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label="Rewind 10 seconds"
          onClick={(event) => {
            event.stopPropagation()
            handleZoneTap('left')
          }}
          className="h-full w-1/4 focus:outline-none md:hidden"
        />
        <span className="h-full w-1/2 md:hidden" />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Forward 10 seconds"
          onClick={(event) => {
            event.stopPropagation()
            handleZoneTap('right')
          }}
          className="h-full w-1/4 focus:outline-none md:hidden"
        />
      </div>

      {/*
        The seek indicator: YouTube's translucent half-disc with the arrows and a
        running total. Above the zones and taking no pointer events, so a rapid
        third tap still lands on the zone underneath it.
      */}
      {seekFlash ? (
        <div
          className={cn(
            'pointer-events-none absolute inset-y-0 z-10 grid w-2/5 place-items-center bg-white/10',
            seekFlash.side === 'left' ? 'left-0 rounded-r-[50%]' : 'right-0 rounded-l-[50%]',
          )}
        >
          <span className="flex flex-col items-center gap-1 text-white">
            {seekFlash.side === 'left' ? (
              <ChevronsLeft className="h-7 w-7" />
            ) : (
              <ChevronsRight className="h-7 w-7" />
            )}
            <span className="text-xs font-medium tabular-nums">{seekFlash.seconds} seconds</span>
          </span>
        </div>
      ) : null}

      {/* A scrim under the bar, so white controls hold up over pale footage. */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-t from-black/70 via-black/25 to-transparent transition-opacity duration-200',
          controlsVisible ? 'opacity-100' : 'opacity-0',
        )}
      />

      <PlayerControls
        player={player}
        playing={playing}
        seconds={clock.seconds}
        duration={clock.duration}
        buffered={clock.buffered}
        visible={controlsVisible}
        containerRef={containerRef}
        onInteracting={setBusy}
      />
    </div>
  )
}
