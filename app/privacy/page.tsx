import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Privacy Policy — MeeTube',
  description: 'What MeeTube stores, what leaves your device, and what it never collects.',
}

/**
 * Public by design: the YouTube API Services Terms require a privacy policy
 * reachable without signing in — moot here since there's no sign-in at all —
 * and this page is also the honest answer to "where does my watch history go".
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-20 pt-8">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to MeeTube
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated 17 September 2026</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed">
        <section className="space-y-3">
          <h2 className="text-base font-medium">The short version</h2>
          <p className="text-muted-foreground">
            MeeTube has no accounts, no sign-in, no database and no analytics. Everything it
            remembers about you — your watch history, saved videos and recent searches — is
            stored in your own browser and never sent anywhere. The home feed is built from a
            fixed list of channels chosen in the app&rsquo;s source, not from anything about you.
            There is nothing for us to sell, share or lose, because we never receive it.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-medium">What is stored on your device</h2>
          <p className="text-muted-foreground">
            These live in your browser&rsquo;s <code className="text-foreground">localStorage</code>,
            on this device only. They are not synced, backed up, or transmitted.
          </p>
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            <li>
              <code className="text-foreground">meetube:watch-history</code> — videos you opened
            </li>
            <li>
              <code className="text-foreground">meetube:watch-later</code> — videos you saved
            </li>
            <li>
              <code className="text-foreground">meetube:recent-searches</code> — your last few
              searches
            </li>
            <li>
              <code className="text-foreground">meetube:queue</code> — videos you lined up to
              play next
            </li>
            <li>
              <code className="text-foreground">meetube:followed-channels</code> — channels you
              starred as shortcuts. This is local only: it is not a YouTube subscription and
              nothing about it is sent to Google
            </li>
            <li>
              <code className="text-foreground">meetube:watch-progress</code> — how far you got
              through recent videos, so they resume where you stopped
            </li>
            <li>
              <code className="text-foreground">meetube:channel-feed</code> — a short-lived cache
              of the home feed
            </li>
            <li>
              <code className="text-foreground">meetube:prefs</code> — your autoplay,
              infinite-scroll and keep-screen-on settings
            </li>
          </ul>
          <p className="text-muted-foreground">
            Search results are also held in{' '}
            <code className="text-foreground">sessionStorage</code> under{' '}
            <code className="text-foreground">meetube:results:*</code> so that returning to a page of
            results doesn&rsquo;t have to fetch it again. That is discarded automatically when you
            close the tab.
          </p>
          <p className="text-muted-foreground">
            Clearing your browser&rsquo;s site data for this domain erases all of it permanently.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-medium">What leaves your device</h2>
          <p className="text-muted-foreground">
            Only the text needed to fetch results. When you search, your search terms are sent to
            this site&rsquo;s server, which forwards them to the YouTube Data API and returns the
            results. The home feed sends nothing about you at all — it asks the server for the
            latest uploads from a fixed list of channels defined in the app&rsquo;s source, the
            same request every time, for everyone.
          </p>
          <p className="text-muted-foreground">
            While you type in the search box, what you have typed so far is sent — through this
            site&rsquo;s server, so your IP address is not shared — to Google&rsquo;s public search
            suggestion service, which is what returns the dropdown of suggested searches. This is
            the same service the search box on youtube.com uses. Nothing is sent until you have
            typed at least two characters.
          </p>
          <p className="text-muted-foreground">
            Your watch history and saved list are never uploaded anywhere.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-medium">Server logs</h2>
          <p className="text-muted-foreground">
            This site is hosted on Vercel, which keeps standard access logs — IP address, timestamp,
            requested URL and user agent — for operational and security purposes. We do not add our
            own logging, analytics, advertising or tracking cookies. See{' '}
            <a
              href="https://vercel.com/legal/privacy-policy"
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Vercel&rsquo;s privacy policy
            </a>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-medium">YouTube</h2>
          <p className="text-muted-foreground">
            MeeTube uses YouTube API Services to search for videos, browse channels, and read
            their public details. By using MeeTube you are also agreeing to the{' '}
            <a
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-4 hover:text-foreground"
            >
              YouTube Terms of Service
            </a>
            , and your information is handled in accordance with the{' '}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Google Privacy Policy
            </a>
            .
          </p>
          <p className="text-muted-foreground">
            MeeTube has <strong className="text-foreground">no Google sign-in and no account
            linking</strong>. It never requests any access to a Google account, reads only
            publicly available video and channel data, and has no way to know who you are.
          </p>
          <p className="text-muted-foreground">
            Videos play in YouTube&rsquo;s own embedded player. That player is served by Google and
            may set its own cookies and collect data under the policies linked above — behaviour we
            neither control nor receive.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-medium">Children</h2>
          <p className="text-muted-foreground">
            MeeTube is not directed at children under 13 and collects no personal information from
            anyone.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-medium">Changes and contact</h2>
          <p className="text-muted-foreground">
            If this policy changes, the date at the top will change with it. MeeTube is an open
            source personal project — you can read exactly what it does, including every line that
            touches your data, at{' '}
            <a
              href="https://github.com/Juntakk/meetube"
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-4 hover:text-foreground"
            >
              github.com/Juntakk/meetube
            </a>
            , or raise an issue there with any question.
          </p>
        </section>
      </div>
    </main>
  )
}
