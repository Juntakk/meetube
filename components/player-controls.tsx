'use client'

import * as React from 'react'
import {
  Maximize,
  Minimize,
  Pause,
  Play,
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
 * captions, quality (setPlaybackQuality has been ignored for years), cast and
 * miniplayer. Playback speed *is* exposed, so the gear is real. Autoplay maps to
 * the app's own next-video preference, so it is real too.
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
  getPlaybackRate?: () => number
  setPlaybackRate?: (rate: number) => void
  getAvailablePlaybackRates?: () => number[]
  /*
   * The captions module. Undocumented but long-standing, and the only route to
   * subtitles the IFrame API offers — so every call is wrapped and the whole
   * feature hides itself if any of it comes back empty, rather than presenting a
   * button that silently does nothing.
   */
  loadModule?: (module: string) => void
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
}

const SPEED_FALLBACK = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

export function PlayerControls({
  player,
  playing,
  seconds,
  duration,
  buffered,
  visible,
  containerRef,
  onInteracting,
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

  const rate = prefs.playbackRate
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const [canFullscreen, setCanFullscreen] = React.useState(false)

  /** Where the thumb sits while dragging, before the seek is committed. */
  const [scrubTo, setScrubTo] = React.useState<number | null>(null)

  const [tracks, setTracks] = React.useState<CaptionTrack[]>([])
  /** The language showing, or null for off. */
  const [caption, setCaption] = React.useState<string | null>(null)

  /*
   * Discover caption tracks by polling, not by waiting for playback.
   *
   * This was gated on `playing` and that was wrong. Verified in a real browser
   * with autoplay left at its default: the video sits paused, `playing` never
   * becomes true, and the CC button simply never appears. The earlier test missed
   * it because Chrome was launched with --autoplay-policy=no-user-gesture-required,
   * which made playback start on its own and the gate always open.
   *
   * A bounded poll instead: ask every second until tracks turn up or the window
   * closes. The tracklist does populate before playback on most videos, and the
   * `playing` dependency stays only so the clock restarts the window if the poll
   * had already given up before you pressed play.
   */
  React.useEffect(() => {
    if (!player) return

    let cancelled = false
    let attempts = 0

    const read = () => {
      try {
        const list = player.getOption?.('captions', 'tracklist')
        if (cancelled || !Array.isArray(list) || list.length === 0) return

        // Found them — no reason to keep asking.
        attempts = Number.POSITIVE_INFINITY
        setTracks(list as CaptionTrack[])

        /*
         * Adopt whatever is actually showing rather than assuming off.
         *
         * Verified in a real browser: `loadModule('captions')` *itself* switches
         * captions on. Defaulting our state to off therefore left the button
         * reading "Turn on subtitles" over a video that was already captioned, and
         * the first press turned them off — the exact opposite of the label. The
         * button has to report the player's truth, not our intention.
         */
        const current = player.getOption?.('captions', 'track') as
          | { languageCode?: string }
          | undefined

        setCaption(current?.languageCode ?? null)
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
  }, [player, playing])

  /** The track to reach for when CC is switched on with no explicit choice. */
  const preferredTrack = React.useMemo(() => {
    if (tracks.length === 0) return null

    /*
     * Your remembered language first, then the browser's, then whatever the video
     * has. The fallback chain matters because a French documentary won't carry the
     * English track you last used, and silently showing nothing would look broken.
     */
    const wanted = [prefs.captionLanguage, navigator.language, 'en']
      .filter((value): value is string => Boolean(value))
      .map((value) => value.slice(0, 2).toLowerCase())

    for (const code of wanted) {
      const match = tracks.find((track) => track.languageCode.slice(0, 2).toLowerCase() === code)
      if (match) return match.languageCode
    }

    return tracks[0].languageCode
  }, [tracks, prefs.captionLanguage])

  const applyCaption = React.useCallback(
    (languageCode: string | null) => {
      if (!player) return

      try {
        // An empty object is how this API expresses "off".
        player.setOption?.('captions', 'track', languageCode ? { languageCode } : {})
        setCaption(languageCode)
        // Remembered, so subtitles stay on for the next video rather than resetting.
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
    rate: prefs.playbackRate,
  })
  savedAudioRef.current = {
    volume: prefs.volume,
    muted: prefs.muted,
    rate: prefs.playbackRate,
  }

  React.useEffect(() => {
    if (!player) return

    const saved = savedAudioRef.current

    try {
      player.setVolume?.(saved.volume)
      if (saved.muted) player.mute?.()
      else player.unMute?.()

      player.setPlaybackRate?.(saved.rate)
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

  /*
   * Whether this browser will allow fullscreen at all — false on iPhone, which
   * only permits it on a <video> element we cannot reach inside the iframe.
   *
   * Deliberately state set from an effect rather than read during render. Reading
   * `document` while rendering makes the server say "no button" and the client say
   * "button", which is exactly the hydration mismatch this used to throw. Starting
   * false means both agree on the first paint and the button appears a tick later.
   */
  React.useEffect(() => {
    setCanFullscreen(
      document.fullscreenEnabled ||
        Boolean(
          (document as unknown as { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled,
        ),
    )
  }, [])

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

    if (document.fullscreenElement) {
      void document.exitFullscreen()
      return
    }

    /*
     * Safari on macOS still needs the prefixed call. iOS Safari has neither, and
     * only allows fullscreen on a <video> element — which lives inside a
     * cross-origin iframe and cannot be reached. On iPhone this button is
     * therefore hidden rather than broken; see `canFullscreen` below.
     */
    const request =
      container.requestFullscreen ??
      (container as unknown as { webkitRequestFullscreen?: () => Promise<void> })
        .webkitRequestFullscreen

    try {
      void request?.call(container)
    } catch {
      // Denied by the browser. Nothing useful to say about it.
    }
  }


  const rates = (() => {
    try {
      const available = player?.getAvailablePlaybackRates?.()
      return available && available.length > 0 ? available : SPEED_FALLBACK
    } catch {
      return SPEED_FALLBACK
    }
  })()

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
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
          event.preventDefault()
          const step = event.key === 'ArrowLeft' ? -5 : 5
          player?.seekTo?.(Math.min(duration, Math.max(0, seconds + step)), true)
        }}
        className="group/bar mx-1 mb-2 flex h-4 cursor-pointer items-center focus:outline-none"
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
          <button
            type="button"
            role="switch"
            aria-checked={prefs.autoplayNext}
            aria-label="Autoplay next video"
            title="Autoplay next video"
            onClick={() => setPrefs({ autoplayNext: !prefs.autoplayNext })}
            className="grid h-8 w-8 place-items-center rounded-full text-white hover:bg-white/15"
          >
            <span
              className={cn(
                'flex h-3 w-6 items-center rounded-full px-0.5 transition-colors',
                prefs.autoplayNext ? 'bg-white' : 'bg-white/40',
              )}
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full transition-transform',
                  prefs.autoplayNext ? 'translate-x-3 bg-black' : 'translate-x-0 bg-white',
                )}
              />
            </span>
          </button>

          {/*
            Only rendered once we know the video actually has captions. A CC button
            on a video with none is worse than no button at all.
          */}
          {tracks.length > 0 ? (
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
          ) : null}

          <button
            type="button"
            aria-label="Playback speed"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
            className="grid h-8 w-8 place-items-center rounded-full text-white hover:bg-white/15"
          >
            <Settings className="h-[18px] w-[18px]" />
          </button>

          {canFullscreen ? (
            <button
              type="button"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              onClick={toggleFullscreen}
              className="grid h-8 w-8 place-items-center rounded-full text-white hover:bg-white/15"
            >
              {isFullscreen ? (
                <Minimize className="h-[18px] w-[18px]" />
              ) : (
                <Maximize className="h-[18px] w-[18px]" />
              )}
            </button>
          ) : null}

          {settingsOpen ? (
            <div className="absolute bottom-full right-0 mb-2 max-h-72 min-w-40 overflow-y-auto rounded-xl bg-black/85 py-1 backdrop-blur">
              {tracks.length > 1 ? (
                <>
                  <p className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-white/60">
                    Subtitles
                  </p>

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

                  <hr className="my-1 border-white/15" />
                </>
              ) : null}

              <p className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-white/60">
                Speed
              </p>
              {rates.map((option) => (
                <SettingsRow
                  key={option}
                  label={option === 1 ? 'Normal' : `${option}×`}
                  active={option === rate}
                  onClick={() => {
                    player?.setPlaybackRate?.(option)
                    setPrefs({ playbackRate: option })
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
