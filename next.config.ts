import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Allow Next.js Image to serve images from the public folder
    // (no remote patterns needed for local brand assets)
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '6mb',
    },
  },
};

export default nextConfig;
