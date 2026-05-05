/** @type {import('next').NextConfig} */
const remotePatterns = []

if (process.env.NEXT_PUBLIC_INSFORGE_URL) {
  try {
    const insforgeUrl = new URL(process.env.NEXT_PUBLIC_INSFORGE_URL)
    remotePatterns.push({
      protocol: insforgeUrl.protocol.replace(":", ""),
      hostname: insforgeUrl.hostname
    })
  } catch {
    // Keep local builds working if the example env has not been filled yet.
  }
}

const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb"
    }
  },
  images: {
    remotePatterns
  }
}

export default nextConfig
