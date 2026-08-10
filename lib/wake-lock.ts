'use client'

import * as React from 'react'

/**
 * Holds a screen wake lock while a video is on screen, so the phone doesn't dim
 * and lock out from under a video you're watching.
 *
 * This is as close as the web gets to YouTube Premium's background playback, and
 * it deliberately isn't the same thing: the screen stays *on* rather than
 * playback continuing while it's off. A cross-origin iframe's media is suspended
 * by both iOS Safari and Android Chrome the moment the screen locks, and no API
 * opts out of that — so the only lever available is not locking.
 *
 * Chrome/Edge 84+ and Safari 16.4+. Firefox has no support, and nothing here
 * needs to care: an absent `navigator.wakeLock` just means the hook does nothing.
 */
export function useWakeLock(enabled: boolean) {
  React.useEffect(() => {
    if (!enabled) return
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return

    let sentinel: WakeLockSentinel | null = null
    let released = false

    const acquire = async () => {
      // A lock can only be taken while the document is actually visible, and
      // requesting one from a hidden tab throws rather than queueing.
      if (released || document.visibilityState !== 'visible' || sentinel) return

      try {
        sentinel = await navigator.wakeLock.request('screen')

        // Cleanup can land mid-await; drop the lock we just took rather than
        // leaking it for the rest of the session.
        if (released) {
          void sentinel.release()
          sentinel = null
          return
        }

        sentinel.addEventListener('release', () => {
          sentinel = null
        })
      } catch {
        /*
         * Denied — low battery, or a permissions policy. Nothing to tell the
         * user: the page works exactly as it did before, the screen just sleeps.
         */
      }
    }

    /*
     * The browser drops the lock whenever the tab is backgrounded and does not
     * hand it back, so returning to the tab has to ask again. Without this the
     * setting silently stops working the first time you switch apps.
     */
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisibilityChange)

      void sentinel?.release()
      sentinel = null
    }
  }, [enabled])
}
