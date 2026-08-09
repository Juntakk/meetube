import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Persistence for the quota ledger, picked at runtime.
 *
 * Three tiers, in order of preference:
 *
 *  1. **Redis over REST** (Vercel KV or Upstash). The only option that actually
 *     works on Vercel, where the filesystem is read-only and every cold start
 *     would otherwise reset the count to zero. Uses plain fetch — no SDK.
 *  2. **A JSON file**, for local development.
 *  3. **Memory**, so nothing ever crashes; the count just doesn't survive a
 *     restart, and `trustworthy` reports false so the UI hedges accordingly.
 */

const LEDGER_PATH = join(process.cwd(), '.quota.json')
const KEY = 'meetube:quota-ledger'

/** Vercel KV and Upstash expose the same REST shape under different names. */
function redisConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN

  return url && token ? { url, token } : null
}

export type Backend = 'redis' | 'file' | 'memory'

export function activeBackend(): Backend {
  if (redisConfig()) return 'redis'
  return canWriteFile() ? 'file' : 'memory'
}

let fileWritable: boolean | null = null

function canWriteFile(): boolean {
  if (fileWritable !== null) return fileWritable

  try {
    // Vercel's bundle is read-only, so this throws there and we fall to memory.
    writeFileSync(LEDGER_PATH, readFileSync(LEDGER_PATH, 'utf8'))
    fileWritable = true
  } catch {
    try {
      writeFileSync(LEDGER_PATH, '{}')
      fileWritable = true
    } catch {
      fileWritable = false
    }
  }

  return fileWritable
}

let memory: string | null = null

export async function readLedger(): Promise<string | null> {
  const redis = redisConfig()

  if (redis) {
    try {
      const response = await fetch(`${redis.url}/get/${encodeURIComponent(KEY)}`, {
        headers: { Authorization: `Bearer ${redis.token}` },
        cache: 'no-store',
      })

      if (!response.ok) return memory

      const body = (await response.json()) as { result?: string | null }
      return body.result ?? null
    } catch {
      // Network blip — fall back to whatever this instance already knows.
      return memory
    }
  }

  if (canWriteFile()) {
    try {
      return readFileSync(LEDGER_PATH, 'utf8')
    } catch {
      return null
    }
  }

  return memory
}

export async function writeLedger(value: string): Promise<void> {
  // Always keep the in-process copy: it's the fallback if the backend errors,
  // and it keeps a single request internally consistent.
  memory = value

  const redis = redisConfig()

  if (redis) {
    try {
      await fetch(`${redis.url}/set/${encodeURIComponent(KEY)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redis.token}`,
          'Content-Type': 'text/plain',
        },
        body: value,
        cache: 'no-store',
      })
    } catch {
      // Counting is best-effort; never fail a search because the ledger didn't save.
    }
    return
  }

  if (canWriteFile()) {
    try {
      writeFileSync(LEDGER_PATH, value)
    } catch {
      // Became read-only mid-run; the memory copy still applies.
    }
  }
}
