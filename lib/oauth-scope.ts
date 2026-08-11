/**
 * The YouTube OAuth scope, and how to tell whether a session actually has it.
 *
 * Its own module rather than part of lib/auth.ts because the browser needs the
 * error constant to render the re-link prompt, and lib/auth.ts pulls in the
 * next-auth Google provider and reads GOOGLE_CLIENT_SECRET. Nothing here has any
 * dependencies at all, so it is safe on both sides.
 */

/** The one scope that lets MeeTube read your subscriptions. Read-only. */
export const YOUTUBE_READONLY_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly'

/** Set on the session when the token simply cannot read subscriptions. */
export const MISSING_SCOPE_ERROR = 'MissingYouTubeScope'

/**
 * Whether a token's granted scopes cover reading subscriptions.
 *
 * Google returns the *granted* scopes, which are not necessarily the requested
 * ones — and it binds them to the refresh token at consent time. A session
 * created before this app asked for YouTube access therefore keeps minting
 * perfectly valid access tokens that Google then rejects with 403
 * ACCESS_TOKEN_SCOPE_INSUFFICIENT, for as long as that refresh token lives.
 * Refreshing can never fix it; only consenting again can. So it has to be
 * detected rather than retried.
 *
 * An unknown scope returns true on purpose: a session from before this field was
 * recorded should keep working, with the API's own 403 as the backstop. The field
 * gets filled in on the next token refresh, within the hour.
 */
export function hasYouTubeScope(scope: unknown): boolean {
  if (typeof scope !== 'string' || scope === '') return true
  return scope.split(' ').includes(YOUTUBE_READONLY_SCOPE)
}
