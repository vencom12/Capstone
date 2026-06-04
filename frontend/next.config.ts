import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
  typescript: {
    // Disable type checking during build to prevent OOM errors on Render free tier
    ignoreBuildErrors: true,
  },
};

export default nextConfig;

