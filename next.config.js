/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep compiled pages in memory longer in dev to avoid HTML pointing at evicted `/_next/static/*` chunks
  // (manifests as 404 spam + broken JS/CSS until full reload — common on Windows after HMR).
  onDemandEntries: {
    maxInactiveAge: 15 * 60 * 1000,
    pagesBufferLength: 20,
  },
  // Reduce Windows watchpack EINVAL noise on special folders (e.g. System Volume Information).
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        aggregateTimeout: 400,
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/$RECYCLE.BIN/**",
          "**/System Volume Information/**",
        ],
      };
    }
    return config;
  },
};

module.exports = nextConfig;
