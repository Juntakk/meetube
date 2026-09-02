/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: 'yt3.ggpht.com' },
      // Channel avatars and banners come back on either host, seemingly at random.
      { protocol: 'https', hostname: 'yt3.googleusercontent.com' },
    ],
    // Thumbnails, avatars and banners are content-addressed by YouTube's own
    // CDN (a given video/channel id always serves the same image), so a long
    // TTL costs nothing in staleness but cuts re-transformations and cache
    // writes way down.
    minimumCacheTTL: 2678400, // 31 days
    // webp only. avif encodes noticeably better but doubles the transform
    // count (one per format actually requested) for a gain nobody notices on
    // a feed of small, already-compressed JPEG thumbnails.
    formats: ['image/webp'],
    // No component here ever passes a custom `quality`, so every request
    // already resolves to the default. Locking the allowlist to that one
    // value stops a stray/crafted quality query string from minting new
    // cache entries for the same image.
    qualities: [75],
    // Trimmed from Next's 8-value default to the breakpoints this app
    // actually renders at (see the `sizes` props on VideoCard, VideoRow and
    // the channel banner) — fewer candidate widths means fewer distinct
    // transformations per source image.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    // Only the fixed-size avatars (40px, 128px) and their @2x variants
    // resolve through this list now that the header logo is unoptimized.
    imageSizes: [64, 96, 128, 256],
  },
  async headers() {
    return [
      {
        // The service worker must not be cached aggressively or updates never land.
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
    ]
  },
}

export default nextConfig
