import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Sidebar pins shared across devices, keyed by profile name (no password —
 * same trust level as the rest of the app). Table is created on first use.
 */

type Pin = { id: string; title: string }

function db() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL
  if (!url) return null
  return neon(url)
}

async function ensureTable(sql: NeonQueryFunction<false, false>) {
  await sql`CREATE TABLE IF NOT EXISTS rail_pins (name text PRIMARY KEY, pins jsonb NOT NULL DEFAULT '[]'::jsonb)`
}

function clean(value: unknown): Pin[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (p): p is Pin =>
        !!p && typeof p.id === 'string' && /^UC[\w-]{22}$/.test(p.id) && typeof p.title === 'string',
    )
    .slice(0, 50)
    .map((p) => ({ id: p.id, title: p.title.slice(0, 200) }))
}

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get('name')?.trim().toLowerCase()
  const sql = db()
  if (!name || !sql) return NextResponse.json({ pins: null })

  try {
    await ensureTable(sql)
    const rows = (await sql`SELECT pins FROM rail_pins WHERE name = ${name}`) as { pins: Pin[] }[]
    return NextResponse.json({ pins: rows[0] ? clean(rows[0].pins) : null })
  } catch {
    return NextResponse.json({ pins: null })
  }
}

export async function PUT(request: Request) {
  const sql = db()
  if (!sql) return NextResponse.json({ error: 'DATABASE_URL is not set' }, { status: 500 })

  const body = (await request.json().catch(() => null)) as { name?: string; pins?: unknown } | null
  const name = body?.name?.trim().toLowerCase()
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  try {
    await ensureTable(sql)
    const pins = JSON.stringify(clean(body?.pins))
    await sql`
      INSERT INTO rail_pins (name, pins) VALUES (${name}, ${pins}::jsonb)
      ON CONFLICT (name) DO UPDATE SET pins = EXCLUDED.pins`
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'save failed' }, { status: 500 })
  }
}
