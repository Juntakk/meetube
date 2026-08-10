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
