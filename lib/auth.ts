import type { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

import {
  hasYouTubeScope,
  MISSING_SCOPE_ERROR,
  YOUTUBE_READONLY_SCOPE,
} from '@/lib/oauth-scope'

/**
 * Google sign-in with read-only YouTube access.
 *
 * Deliberately database-free: the JWT session strategy keeps everything in an
 * encrypted cookie, so there is no table to provision and no user data at rest
 * on any server. MeeTube's own state (watch history, saved videos, topics) stays
 * in localStorage exactly as before — signing in adds a data *source*, it doesn't
 * move your data anywhere.
 *
 * The point of linking is cost as much as personalisation: reading your real
 * subscriptions costs 1 unit where the topic searches it replaces cost 100 each.
 */

/** Read-only. MeeTube never writes to your YouTube account. */
const SCOPES = ['openid', 'email', 'profile', YOUTUBE_READONLY_SCOPE].join(' ')

/** Refresh a little early so a request never races the expiry. */
const EXPIRY_SKEW_MS = 60_000

type GoogleTokens = {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  /** Space-separated granted scopes. Google returns these on refresh too. */
  scope?: string
  error?: string
}

/**
 * Google only issues a refresh token on the first consent, so `prompt: 'consent'`
 * is set below to make sure we always get one — otherwise a returning user ends
 * up with a session that dies in an hour and can't be renewed.
 */
async function refreshAccessToken(token: Record<string, unknown>) {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        grant_type: 'refresh_token',
        refresh_token: String(token.refreshToken ?? ''),
      }),
    })

    const refreshed = (await response.json()) as GoogleTokens

    if (!response.ok || !refreshed.access_token) {
      throw new Error(refreshed.error ?? 'Token refresh failed')
    }

    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
      // Google usually omits refresh_token on refresh; keep the original.
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      /*
       * Refreshing re-reports the granted scopes, which is how a session created
       * before this app asked for YouTube access finds out it is missing it —
       * within the hour, without the user doing anything.
       */
      scope: refreshed.scope ?? token.scope,
      error: undefined,
    }
  } catch {
    // Surfaced to the client so the UI can prompt a fresh sign-in rather than
    // silently showing an empty feed.
    return { ...token, error: 'RefreshAccessTokenError' }
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      authorization: {
        params: {
          scope: SCOPES,
          // Both are required to receive a refresh token from Google.
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],

  // No adapter, no database — the session is the cookie.
  session: { strategy: 'jwt' },

  callbacks: {
    async jwt({ token, account }) {
      // First sign-in: stash the tokens the YouTube calls will need.
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          // What Google actually granted, which can be narrower than SCOPES.
          scope: account.scope,
          accessTokenExpires: account.expires_at
            ? account.expires_at * 1000
            : Date.now() + 3600 * 1000,
        }
      }

      const expires = typeof token.accessTokenExpires === 'number' ? token.accessTokenExpires : 0
      if (Date.now() < expires - EXPIRY_SKEW_MS) return token

      return refreshAccessToken(token)
    },

    async session({ session, token }) {
      /*
       * A token that can't read subscriptions is reported as an error rather than
       * as "linked", so the feed falls back to topic seeds instead of spending a
       * call that is guaranteed to 403.
       */
      const error =
        (token.error as string | undefined) ??
        (hasYouTubeScope(token.scope) ? undefined : MISSING_SCOPE_ERROR)

      // The access token is intentionally NOT exposed to the browser; only the
      // server reads it off the JWT. The client just needs to know it's linked.
      return {
        ...session,
        youtubeLinked: !error && Boolean(token.accessToken),
        error,
      }
    },
  },

  pages: {
    // Errors land back on the app rather than next-auth's default page.
    error: '/',
  },
}

/** True when the OAuth client is configured; used to hide sign-in if it isn't. */
export function isAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}
