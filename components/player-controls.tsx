'use client'

import * as React from 'react'
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  RectangleHorizontal,
  Settings,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react'

import { usePrefs } from '@/lib/prefs'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/lib/youtube'

/**
 * Our own control bar, laid out like youtube.com's watch page: floating rounded
 * groups over the video rather than one full-width gradient bar.
 *
 * This exists because the /embed/ player ships YouTube's *older* control chrome
 * and no parameter switches it to the watch-page design. So the embed runs with
 * `controls: 0` and everything below is driven through the IFrame API.
 *
 * What that API does not expose, and is therefore absent rather than fake:
 * quality (setPlaybackQuality has been ignored for years), cast and
 * miniplayer. Autoplay maps to the app's own next-video preference, so it is
 * real.
 */

/**
 * A caption track as the player reports it.
 *
 * `kind: 'asr'` marks YouTube's own machine-generated captions, which is what
 * most videos have and what makes a "subtitle generator" possible here at all —
 * we surface YouTube's transcription rather than producing one, because the audio
 * lives inside a cross-origin iframe and cannot be captured.
 */
export type CaptionTrack = {
  languageCode: string
  languageName?: string
  kind?: string
  vss_id?: string
}

/** Just the methods the bar drives — declared structurally to avoid an import cycle. */
export type ControllablePlayer = {
  playVideo?: () => void
  pauseVideo?: () => void
  mute?: () => void
  unMute?: () => void
  isMuted?: () => boolean
  setVolume?: (volume: number) => void
  getVolume?: () => number
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void
  /*
   * The captions module. Undocumented, and unreliable in a specific way
   * confirmed directly rather than assumed: `getOption` on this player build
   * routinely reports stale or empty values — `tracklist` can read `[]` for a
   * video that demonstrably has captions, and `track` can keep echoing a
   * language that's no longer showing. `setOption` and `unloadModule`, by
   * contrast, reliably control what's actually on screen. So every read
   * from this module is treated as unreliable, best-effort only; nothing
   * user-facing depends on it answering correctly.
   */
  loadModule?: (module: string) => void
  unloadModule?: (module: string) => void
  setOption?: (module: string, option: string, value: unknown) => void
  getOption?: (module: string, option: string) => unknown
}

type PlayerControlsProps = {
  player: ControllablePlayer | undefined
  playing: boolean
  seconds: number
  duration: number
  /** 0–1 of the video downloaded, for the lighter track behind the red fill. */
  buffered: number
  /** Hidden with the rest of the chrome when the player is idle. */
  visible: boolean
  /** The element that goes fullscreen — the player's own wrapper. */
  containerRef: React.RefObject<HTMLDivElement | null>
  /** Keeps the bar up while a menu inside it is open. */
  onInteracting: (busy: boolean) => void
  /**
   * Fires whenever fullscreen (either kind) opens or closes.
   *
   * Exists for one reason: the watch page pins the player under the app bar
   * with `position: sticky` while scrolling, and any `position: sticky` (or
   * `fixed`) ancestor with its own z-index creates a stacking context that
   * *traps* a fixed-position descendant inside it — no z-index on this
   * component, however large, can out-rank the site header from inside that
   * trap. Confirmed directly: without this, the pseudo-fullscreen overlay and
   * the rotation fallback both rendered fine by every DOM measurement, and
   * both sat visibly *behind* the header and bottom dock on screen. The
   * parent is the one that can neutralize its own sticky wrapper, so it has
   * to be told.
   */
  onFullscreenChange?: (active: boolean) => void
}

export function PlayerControls({
  player,
  playing,
  seconds,
  duration,
  buffered,
  visible,
  containerRef,
  onInteracting,
  onFullscreenChange,
}: PlayerControlsProps) {
  const { prefs, set: setPrefs } = usePrefs()

  const barRef = React.useRef<HTMLDivElement | null>(null)

  /*
   * Volume and mute live in prefs, so they survive the next video and the next
   * session — which is what youtube.com does.
   *
   * `volumeDraft` is the escape hatch for dragging: a range input fires onChange
   * on every pixel of movement, and writing each one straight to prefs would mean
   * a localStorage write and a re-render of the whole watch page per tick. The
   * draft drives the UI and the player immediately; prefs are written once the
   * drag settles.
   */
  const [volumeDraft, setVolumeDraft] = React.useState<number | null>(null)
  const persistTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const muted = prefs.muted
  const volume = volumeDraft ?? prefs.volume

  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  /*
   * The CSS fallback for browsers that won't grant real fullscreen on this
   * container — iOS Safari, whose Fullscreen API only reaches a <video>
   * element, and the video here lives inside a cross-origin iframe. A fixed,
   * viewport-filling overlay gets the same result without that API.
   */
  const [pseudoFullscreen, setPseudoFullscreen] = React.useState(false)

  /** Where the thumb sits while dragging, before the seek is committed. */
  const [scrubTo, setScrubTo] = React.useState<number | null>(null)

  /**
   * The time under the cursor while merely hovering the bar, not dragging it
   * — `scrubTo` already covers the drag case, via the window listener in
   * startScrub below. Whichever of the two is active is what the floating
   * timestamp (further down) shows.
   */
  const [hoverAt, setHoverAt] = React.useState<number | null>(null)
  const previewAt = scrubTo ?? hoverAt

  /**
   * Tracks discovered so far — best-effort only, and no longer load-bearing.
   *
   * This used to be what the CC button's very existence was gated on, and
   * that broke outright: confirmed directly, `getOption('captions',
   * 'tracklist')` on this player build routinely answers `[]` for a video
   * that demonstrably has captions — turning them on with `setOption` and
   * watching them render, tracklist still reads empty throughout. The button
   * below no longer waits on this; it always renders, and this only feeds
   * the optional per-language menu on the rare video where discovery
   * actually works.
   */
  const [tracks, setTracks] = React.useState<CaptionTrack[]>([])
  /** The language we've asked for, or null for off — our own intent, not a readback. */
  const [caption, setCaption] = React.useState<string | null>(null)

  // A new player instance (new video) starts with captions off regardless of
  // what the last one was showing, so our idea of "on" has to reset with it
  // rather than carry a stale label into the next video.
  React.useEffect(() => {
    setCaption(null)
    setTracks([])
  }, [player])

  // Bounded, best-effort poll for the language menu. See the `tracks` comment
  // above for why nothing depends on this succeeding.
  React.useEffect(() => {
    if (!player) return

    let cancelled = false
    let attempts = 0

    const read = () => {
      try {
        const list = player.getOption?.('captions', 'tracklist')
        if (cancelled || !Array.isArray(list) || list.length === 0) return

        attempts = Number.POSITIVE_INFINITY
        setTracks(list as CaptionTrack[])
      } catch {
        // Module not up yet, or this player build has no captions support.
      }
    }

    read()

    const poll = setInterval(() => {
      attempts += 1
      // ~20s is generous for a tracklist that is going to arrive at all.
      if (cancelled || attempts > 20) {
        clearInterval(poll)
        return
      }
      read()
    }, 1000)

    return () => {
      cancelled = true
      clearInterval(poll)
    }
  }, [player])

  /** The track to reach for when CC is switched on with no explicit choice. */
  const preferredTrack = React.useMemo(() => {
    /*
     * Your remembered language first, then the browser's, then a plain guess.
     * The fallback chain matters because a French documentary won't carry the
     * English track you last used, and silently showing nothing would look
     * broken — but since tracklist discovery can't be relied on to have run
     * yet (see above), the last resort is a guess we hand to the player
     * directly rather than a track we've actually confirmed exists.
     */
    const wanted = [prefs.captionLanguage, navigator.language, 'en']
      .filter((value): value is string => Boolean(value))
      .map((value) => value.slice(0, 2).toLowerCase())

    for (const code of wanted) {
      const match = tracks.find((track) => track.languageCode.slice(0, 2).toLowerCase() === code)
      if (match) return match.languageCode
    }

    return wanted[0] ?? 'en'
  }, [tracks, prefs.captionLanguage])

  const applyCaption = React.useCallback(
    (languageCode: string | null) => {
      if (!player) return

      try {
        if (languageCode) {
          player.setOption?.('captions', 'track', { languageCode })
        } else {
          /*
           * `setOption('captions', 'track', {})` alone is the documented way
           * to say "off", but confirmed directly on this player build it
           * isn't enough by itself — the previous track kept rendering.
           * unloadModule first is what actually clears it; setOption after
           * is kept too; it's precisely the failure mode above.
           */
          player.unloadModule?.('captions')
          player.setOption?.('captions', 'track', {})
        }

        setCaption(languageCode)
        // Remembered, so subtitles reuse the same language next time you turn
        // them on — they don't come back on by themselves for a new video.
        setPrefs({ captionLanguage: languageCode })
      } catch {
        // Nothing to report: the button simply won't appear to have changed.
      }
    },
    [player, setPrefs],
  )

  /*
   * Push the remembered volume onto each new player.
   *
   * The inverse of what this used to do — it read the player's volume and adopted
   * it, which meant every video started at whatever YouTube felt like and the
   * setting never carried over. Read through a ref so a later volume change
   * doesn't re-run this and fight the drag in progress.
   */
  const savedAudioRef = React.useRef({
    volume: prefs.volume,
    muted: prefs.muted,
  })
  savedAudioRef.current = {
    volume: prefs.volume,
    muted: prefs.muted,
  }

  React.useEffect(() => {
    if (!player) return

    const saved = savedAudioRef.current

    try {
      player.setVolume?.(saved.volume)
      if (saved.muted) player.mute?.()
      else player.unMute?.()
    } catch {
      // Not ready for these yet; the next interaction will apply them.
    }
  }, [player])

  React.useEffect(() => () => clearTimeout(persistTimerRef.current), [])

  React.useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const fullscreenActive = isFullscreen || pseudoFullscreen

  // See onFullscreenChange's doc comment: this is what lets the watch page
  // drop its sticky wrapper's stacking context for exactly as long as it
  // would otherwise trap the fullscreen overlay behind the site header.
  React.useEffect(() => {
    onFullscreenChange?.(fullscreenActive)
  }, [fullscreenActive, onFullscreenChange])

  /*
   * The pseudo-fullscreen overlay: a fixed box pinned to the viewport, applied
   * directly to the container's own style rather than through a Tailwind class,
   * since it has to win over the `aspect-video md:rounded-xl` the container
   * always renders with.
   */
  React.useEffect(() => {
    const container = containerRef.current
    if (!container || !pseudoFullscreen) return

    Object.assign(container.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
      width: '100vw',
      height: '100dvh',
      aspectRatio: 'auto',
      borderRadius: '0',
    })
    document.body.style.overflow = 'hidden'

    return () => {
      Object.assign(container.style, {
        position: '',
        inset: '',
        zIndex: '',
        width: '',
        height: '',
        aspectRatio: '',
        borderRadius: '',
      })
      document.body.style.overflow = ''
    }
  }, [pseudoFullscreen, containerRef])

  // Escape exits the real Fullscreen API for free; the CSS fallback has no
  // browser chrome to do that for it, so it needs its own listener.
  React.useEffect(() => {
    if (!pseudoFullscreen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPseudoFullscreen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pseudoFullscreen])

  // A menu left open must not be dismissed by the idle timer underneath it.
  React.useEffect(() => onInteracting(settingsOpen), [settingsOpen, onInteracting])

  const displayed = scrubTo ?? seconds
  const fraction = duration > 0 ? Math.min(1, Math.max(0, displayed / duration)) : 0

  const secondsAtClientX = React.useCallback(
    (clientX: number) => {
      const bar = barRef.current
      if (!bar || duration <= 0) return null

      const box = bar.getBoundingClientRect()
      if (box.width === 0) return null

      const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width))
      return ratio * duration
    },
    [duration],
  )

  /*
   * Scrubbing is driven from window listeners rather than the bar's own move
   * handler, so dragging off the end of the bar — or off the player entirely —
   * keeps working instead of stranding the thumb.
   */
  const startScrub = React.useCallback(
    (clientX: number) => {
      const at = secondsAtClientX(clientX)
      if (at === null) return

      setScrubTo(at)

      const onMove = (event: PointerEvent) => {
        const next = secondsAtClientX(event.clientX)
        if (next !== null) setScrubTo(next)
      }

      const onUp = (event: PointerEvent) => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)

        const commitAt = secondsAtClientX(event.clientX) ?? at
        player?.seekTo?.(commitAt, true)
        setScrubTo(null)
        onInteracting(false)
      }

      onInteracting(true)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [onInteracting, player, secondsAtClientX],
  )

  const toggleMute = () => {
    if (!player) return

    if (muted || volume === 0) {
      player.unMute?.()

      // Unmuting something that was dragged to zero has to restore an audible
      // level, or the button appears to do nothing.
      if (volume === 0) {
        player.setVolume?.(100)
        setVolumeDraft(null)
        setPrefs({ volume: 100, muted: false })
        return
      }

      setPrefs({ muted: false })
    } else {
      player.mute?.()
      setPrefs({ muted: true })
    }
  }

  const changeVolume = (next: number) => {
    if (!player) return

    // Draft first: the slider and the player respond on this frame.
    setVolumeDraft(next)
    player.setVolume?.(next)

    // Dragging up from silence should unmute; dragging to zero should mute.
    const nextMuted = next === 0
    if (nextMuted) player.mute?.()
    else if (muted) player.unMute?.()

    clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => {
      setPrefs({ volume: next, muted: nextMuted })
      // Hand authority back to prefs now that they agree.
      setVolumeDraft(null)
    }, 250)
  }

  const toggleFullscreen = () => {
    const container = containerRef.current
    if (!container) return

    if (pseudoFullscreen) {
      setPseudoFullscreen(false)
      return
    }

    if (document.fullscreenElement) {
      void document.exitFullscreen()
      return
    }

    // Safari on macOS still needs the prefixed call.
    const request =
      container.requestFullscreen ??
      (container as unknown as { webkitRequestFullscreen?: () => Promise<void> })
        .webkitRequestFullscreen

    /*
     * iOS Safari has neither, or exposes `requestFullscreen` (iPad) only to
     * reject its promise for a plain div — it only allows fullscreen on a
     * <video> element, which lives inside a cross-origin iframe here and
     * can't be reached. Either way, the CSS overlay is the fallback.
     */
    if (!request) {
      setPseudoFullscreen(true)
      return
    }

    try {
      void request.call(container).catch(() => setPseudoFullscreen(true))
    } catch {
      setPseudoFullscreen(true)
    }
  }


  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2

  return (
    <div
      className={cn(
        /*
         * Always hard against the bottom edge, where youtube.com puts it.
         *
         * Captions live in the same band — YouTube positions them above where
         * *its* own control bar would be, and with `controls: 0` there is no
         * such bar, so they drop to the very bottom. Their position isn't ours
         * to change; no player parameter exposes it, and the iframe is
         * cross-origin. The bar used to lift itself out of the way, which moved
         * the controls whenever subtitles were toggled. Overlapping instead:
         * z-20 paints the bar over the iframe, so captions pass behind it, and
         * the bar fades out after IDLE_HIDE_MS anyway.
         */
        'absolute inset-x-0 bottom-0 z-20 px-2 pb-2 transition-all duration-200 sm:px-3 sm:pb-3',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
      // Clicks in the bar must never reach the play/pause layer behind it.
      onClick={(event) => event.stopPropagation()}
    >
      {/* The scrubber. A group so the track can thicken and the thumb appear on hover. */}
      <div
        ref={barRef}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(displayed)}
        aria-valuetext={`${formatDuration(displayed)} of ${formatDuration(duration)}`}
        onPointerDown={(event) => {
          event.preventDefault()
          startScrub(event.clientX)
        }}
        onPointerMove={(event) => {
          // Dragging already tracks this through startScrub's own window
          // listener; this is only for looking without clicking.
          if (event.pointerType !== 'mouse' || scrubTo !== null) return
          setHoverAt(secondsAtClientX(event.clientX))
        }}
        onPointerLeave={() => setHoverAt(null)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
          event.preventDefault()
          const step = event.key === 'ArrowLeft' ? -5 : 5
          player?.seekTo?.(Math.min(duration, Math.max(0, seconds + step)), true)
        }}
        className="group/bar relative mx-1 mb-2 flex h-4 cursor-pointer items-center focus:outline-none"
      >
        <div className="relative h-[3px] w-full rounded-full bg-white/30 transition-[height] group-hover/bar:h-[5px]">
          {/* Downloaded-but-unplayed, as YouTube shows behind the red. */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-white/40"
            style={{ width: `${buffered * 100}%` }}
          />

          <div
            className="absolute inset-y-0 left-0 rounded-full bg-brand"
            style={{ width: `${fraction * 100}%` }}
          >
            <span
              className={cn(
                'absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 translate-x-1/2 rounded-full bg-brand transition-transform',
                scrubTo === null ? 'scale-0 group-hover/bar:scale-100' : 'scale-100',
              )}
            />
          </div>
        </div>

        {/*
          The floating timestamp: shown while hovering (not dragging, via
          hoverAt) or while actually dragging the thumb (via scrubTo).
          Positioned in the same percentage space as the fill above rather
          than off a captured pixel rect, since this bar isn't inside
          anything that clips or scrolls.
        */}
        {previewAt !== null ? (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-full left-0 mb-3 -translate-x-1/2 rounded bg-black/85 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white"
            style={{ left: `${duration > 0 ? Math.min(100, Math.max(0, (previewAt / duration) * 100)) : 0}%` }}
          >
            {formatDuration(previewAt)}
          </span>
        ) : null}
      </div>

      <div className="flex items-end justify-between gap-2">
        {/* Left group: separate rounded pieces, as in the watch-page design. */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <RoundButton
            label={playing ? 'Pause' : 'Play'}
            onClick={() => (playing ? player?.pauseVideo?.() : player?.playVideo?.())}
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </RoundButton>

          {/*
            The slider expands on hover, which is how youtube.com does it — the
            resting state is just the speaker. Hidden on touch, where there is no
            hover and the hardware buttons are the volume control anyway.
          */}
          <div className="group/vol hidden items-center rounded-full bg-black/60 backdrop-blur sm:flex">
            <button
              type="button"
              aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'}
              onClick={toggleMute}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white hover:bg-white/15"
            >
              <VolumeIcon className="h-5 w-5" />
            </button>

            <div className="w-0 overflow-hidden transition-[width] duration-200 group-hover/vol:w-24 group-focus-within/vol:w-24">
              <input
                type="range"
                min={0}
                max={100}
                value={muted ? 0 : volume}
                aria-label="Volume"
                onChange={(event) => changeVolume(Number(event.target.value))}
                className="mx-3 h-1 w-[4.5rem] cursor-pointer accent-white"
              />
            </div>
          </div>

          <span className="flex h-11 items-center rounded-full bg-black/60 px-3.5 text-[13px] font-medium tabular-nums text-white backdrop-blur sm:text-sm">
            {formatDuration(displayed)} / {formatDuration(duration)}
          </span>
        </div>

        {/* Right group: one pill holding the remaining controls, as in the design. */}
        <div className="relative flex h-11 items-center gap-0.5 rounded-full bg-black/60 px-1.5 backdrop-blur">
          {/*
            Always rendered now, not gated on tracks.length — see the `tracks`
            comment above. Most videos have at least auto-generated captions,
            and clicking this on the rare one that has none is a harmless
            no-op, which is a better failure mode than a button that's
            unreachable on every video because discovery didn't work.
          */}
          <button
            type="button"
            aria-label={caption ? 'Turn off subtitles' : 'Turn on subtitles'}
            aria-pressed={Boolean(caption)}
            title={caption ? 'Subtitles on' : 'Subtitles'}
            onClick={() => applyCaption(caption ? null : preferredTrack)}
            className="grid h-8 w-8 place-items-center rounded-full text-white hover:bg-white/15"
          >
            {/* YouTube marks the active state with an underline, not a fill. */}
            <span
              className={cn(
                'border-b-2 pb-px text-[11px] font-bold leading-none tracking-tight',
                caption ? 'border-brand' : 'border-transparent',
              )}
            >
              CC
            </span>
          </button>

          {/*
            Only when there's an actual choice to make — most videos have at
            most one subtitle track, and the CC button above already toggles
            that one on and off with no menu needed. This is purely the
            multi-language picker for the rare video that has more than one.
          */}
          {tracks.length > 1 ? (
            <button
              type="button"
              aria-label="Subtitle language"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((open) => !open)}
              className="grid h-8 w-8 place-items-center rounded-full text-white hover:bg-white/15"
            >
              <Settings className="h-[18px] w-[18px]" />
            </button>
          ) : null}

          {/*
            Desktop only — a phone's watch page is already single-column and
            edge-to-edge, so there's no sidebar for this to drop. Hidden while
            fullscreen too: the layout it toggles is already moot once the
            player fills the whole screen.
          */}
          <button
            type="button"
            aria-label={prefs.theaterMode ? 'Exit theater mode' : 'Theater mode'}
            aria-pressed={prefs.theaterMode}
            title={prefs.theaterMode ? 'Default view' : 'Theater mode'}
            onClick={() => setPrefs({ theaterMode: !prefs.theaterMode })}
            className={cn(
              'hidden h-8 w-8 place-items-center rounded-full text-white hover:bg-white/15 md:grid',
              fullscreenActive && 'md:hidden',
            )}
          >
            <RectangleHorizontal className="h-[18px] w-[18px]" />
          </button>

          <button
            type="button"
            aria-label={fullscreenActive ? 'Exit fullscreen' : 'Fullscreen'}
            onClick={toggleFullscreen}
            className="grid h-8 w-8 place-items-center rounded-full text-white hover:bg-white/15"
          >
            {fullscreenActive ? (
              <Minimize className="h-[18px] w-[18px]" />
            ) : (
              <Maximize className="h-[18px] w-[18px]" />
            )}
          </button>

          {settingsOpen ? (
            <div className="absolute bottom-full right-0 mb-2 max-h-72 min-w-40 overflow-y-auto rounded-xl bg-black/85 py-1 backdrop-blur">
              <SettingsRow
                label="Off"
                active={caption === null}
                onClick={() => {
                  applyCaption(null)
                  setSettingsOpen(false)
                }}
              />

              {tracks.map((track) => (
                <SettingsRow
                  key={track.vss_id ?? track.languageCode}
                  label={
                    // ASR tracks are labelled as such, the way YouTube does.
                    `${track.languageName ?? track.languageCode}${
                      track.kind === 'asr' ? ' (auto)' : ''
                    }`
                  }
                  active={caption === track.languageCode}
                  onClick={() => {
                    applyCaption(track.languageCode)
                    setSettingsOpen(false)
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function SettingsRow({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-8 w-full items-center gap-2 px-3 text-left text-[13px] text-white hover:bg-white/15',
        active && 'font-semibold',
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', active ? 'bg-brand' : 'bg-transparent')} />
      <span className="truncate">{label}</span>
    </button>
  )
}

function RoundButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/75"
    >
      {children}
    </button>
  )
}
