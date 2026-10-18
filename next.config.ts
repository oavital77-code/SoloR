import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // screens retired by the customer spec (18.10.2026): Live/reels and categories live inside the feed and search now
  async redirects() {
    return [
      { source: "/discover", destination: "/", permanent: false },
      { source: "/categories", destination: "/search", permanent: false },
      { source: "/profile", destination: "/settings", permanent: false },
    ];
  },
};

export default nextConfig;
