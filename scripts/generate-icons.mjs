/*
 * Generates the placeholder app icons with zero dependencies — a white play
 * triangle on an orange rounded square, transparent everywhere else.
 *
 * Emits public/icon-{32,180,192,512}.png, public/favicon.ico, and a full-bleed
 * public/icon-maskable-512.png for Android. Swap in real artwork whenever you
 * have it:
 *
 *   npm run icons
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const ACCENT = [0xf9, 0x73, 0x16]
const GLYPH = [0xff, 0xff, 0xff]

// ---------- PNG encoding ----------

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let crc = -1
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)

  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])

  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData))

  return Buffer.concat([length, typeAndData, crc])
}

/** rgba: Buffer of size*size*4 bytes. */
function encodePng(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: truecolour + alpha
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // adaptive filtering
  ihdr[12] = 0 // no interlace

  // Each scanline is prefixed with filter type 0 (None).
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------- shapes ----------

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) return false

  const cx = Math.min(Math.max(x, left + radius), right - radius)
  const cy = Math.min(Math.max(y, top + radius), bottom - radius)

  const dx = x - cx
  const dy = y - cy

  return dx * dx + dy * dy <= radius * radius
}

function insideTriangle(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const sign = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3)

  const d1 = sign(px, py, ax, ay, bx, by)
  const d2 = sign(px, py, bx, by, cx, cy)
  const d3 = sign(px, py, cx, cy, ax, ay)

  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0

  return !(hasNegative && hasPositive)
}

/**
 * Transparent outside the rounded square, so the icon sits on whatever the
 * browser tab or home screen uses rather than carrying its own black plate.
 *
 * `maskable: true` instead fills the whole canvas edge to edge — Android crops
 * maskable icons to its own shape, and a transparent one renders as a hole.
 */
function renderIcon(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4)

  const inset = size * 0.1
  const left = inset
  const top = inset
  const right = size - inset
  const bottom = size - inset
  const radius = size * 0.22

  // Play triangle, centred, nudged right so it reads as balanced.
  const a = [size * 0.4, size * 0.33]
  const b = [size * 0.4, size * 0.67]
  const c = [size * 0.68, size * 0.5]

  // 3x3 supersampling keeps the curves and diagonals from looking jagged.
  const SAMPLES = 3
  const step = 1 / (SAMPLES + 1)
  const total = SAMPLES * SAMPLES

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0
      let g = 0
      let b2 = 0
      let covered = 0

      for (let sy = 1; sy <= SAMPLES; sy += 1) {
        for (let sx = 1; sx <= SAMPLES; sx += 1) {
          const px = x + sx * step
          const py = y + sy * step

          const inside = maskable || insideRoundedRect(px, py, left, top, right, bottom, radius)
          if (!inside) continue

          const color = insideTriangle(px, py, a, b, c) ? GLYPH : ACCENT

          r += color[0]
          g += color[1]
          b2 += color[2]
          covered += 1
        }
      }

      const offset = (y * size + x) * 4

      if (covered > 0) {
        // Average only the covered samples, then let alpha carry the coverage —
        // averaging in the uncovered ones would darken the edge pixels.
        rgba[offset] = Math.round(r / covered)
        rgba[offset + 1] = Math.round(g / covered)
        rgba[offset + 2] = Math.round(b2 / covered)
        rgba[offset + 3] = Math.round((covered / total) * 255)
      }
    }
  }

  return encodePng(size, rgba)
}

/**
 * Wraps a PNG in an ICO container. Every browser still in use reads PNG-in-ICO,
 * and it means favicon.ico shares exactly the same artwork as the PWA icons.
 */
function pngToIco(png, size) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(1, 4) // one image

  const entry = Buffer.alloc(16)
  entry[0] = size >= 256 ? 0 : size // 0 means 256
  entry[1] = size >= 256 ? 0 : size
  entry[2] = 0 // palette size
  entry[3] = 0 // reserved
  entry.writeUInt16LE(1, 4) // colour planes
  entry.writeUInt16LE(32, 6) // bits per pixel
  entry.writeUInt32BE(0, 8)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(header.length + entry.length, 12)

  return Buffer.concat([header, entry, png])
}

mkdirSync(OUT_DIR, { recursive: true })

// 32px favicon, 180px iOS touch icon, and the two manifest sizes.
for (const size of [32, 180, 192, 512]) {
  const file = join(OUT_DIR, `icon-${size}.png`)
  writeFileSync(file, renderIcon(size))
  console.log(`wrote ${file}`)
}

const icoPath = join(OUT_DIR, 'favicon.ico')
writeFileSync(icoPath, pngToIco(renderIcon(32), 32))
console.log(`wrote ${icoPath}`)

// Full-bleed variant for the manifest's maskable slot.
const maskablePath = join(OUT_DIR, 'icon-maskable-512.png')
writeFileSync(maskablePath, renderIcon(512, { maskable: true }))
console.log(`wrote ${maskablePath}`)
