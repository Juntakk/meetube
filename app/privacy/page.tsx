import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Privacy Policy — MeeTube',
  description: 'What MeeTube stores, what leaves your device, and what it never collects.',
}

/**
 * Public and unauthenticated by design: the YouTube API Services Terms require a
 * privacy policy reachable without signing in, and this page is also the honest
 * answer to "where does my watch history go".
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
      <p className="mt-2 text-sm text-muted-foreground">Last updated 8 August 2026</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed">
        <section className="space-y-3">
          <h2 className="text-base font-medium">The short version</h2>
          <p className="text-muted-foreground">
            MeeTube has no accounts, no database and no analytics. Everything it remembers about
            you — your watch history, saved videos, recent searches and chosen topics — is stored
            in your own browser and never sent anywhere. There is nothing for us to sell, share or
            lose, because we never receive it.
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
              <code className="text-foreground">meetube:watch-history</code> — videos you opened,
              used to rank recommendations
            </li>
            <li>
              <code className="text-foreground">meetube:watch-later</code> — videos you saved
            </li>
            <li>
              <code className="text-foreground">meetube:recent-searches</code> — your last few
              searches
            </li>
            <li>
              <code className="text-foreground">meetube:interests</code> — which topics your feed
              draws from
            </li>
            <li>
              <code className="text-foreground">meetube:featured-cache</code> — a short-lived cache
              of feed results
            </li>
          </ul>
          <p className="text-muted-foreground">
            Clearing your browser&rsquo;s site data for this domain erases all of it permanently.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-medium">What leaves your device</h2>
          <p className="text-muted-foreground">
            Only the text needed to fetch results. When you search, your search terms are sent to
            this site&rsquo;s server, which forwards them to the YouTube Data API and returns the
            results. When your personalised feed refreshes, it sends a small number of{' '}
            <em>seed terms</em> — a topic name such as &ldquo;volleyball tactics explained&rdquo;,
            or a channel you watch often.
          </p>
          <p className="text-muted-foreground">
            Your watch history and saved list are never uploaded. The ranking that uses them runs
            entirely in your browser.
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
            MeeTube uses YouTube API Services to search for videos and read their public details.
            By using MeeTube you are also agreeing to the{' '}
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
            MeeTube never asks you to sign in to Google and has no access to your YouTube account,
            subscriptions or viewing history. It only reads publicly available video data.
          </p>
          <p className="text-muted-foreground">
            Videos play in YouTube&rsquo;s own embedded player. That player is served by Google and
            may set its own cookies and collect data under the policies linked above — behaviour we
            neither control nor receive.
          </p>
          <p className="text-muted-foreground">
            You can review or revoke data that Google holds about you at{' '}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Google security settings
            </a>
            .
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
