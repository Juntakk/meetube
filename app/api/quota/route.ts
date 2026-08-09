import { NextResponse } from 'next/server'

import { getQuota, markExhausted, setBudget, setUsage } from '@/lib/quota'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Current usage. Cheap and local — reads the ledger, never calls YouTube. */
export async function GET() {
  return NextResponse.json(getQuota())
}

/**
 * Manual correction, for when the ledger and the Google Cloud console disagree —
 * which happens whenever the key is used outside this app, or the process
 * restarted mid-day on a filesystem it couldn't write to.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string
      searchesUsed?: number
      budget?: number
    }

    if (body.action === 'exhausted') {
      markExhausted()
    } else if (typeof body.budget === 'number') {
      setBudget(body.budget)
    } else if (typeof body.searchesUsed === 'number') {
      setUsage(body.searchesUsed)
    } else {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
    }

    return NextResponse.json(getQuota())
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }
}
