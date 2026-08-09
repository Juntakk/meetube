'use client'

import { SessionProvider } from 'next-auth/react'
import type { ReactNode } from 'react'

/**
 * next-auth's provider is a client component, and the root layout is a server
 * component, so it needs this thin wrapper to cross the boundary.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
