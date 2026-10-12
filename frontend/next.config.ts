import type { NextConfig } from "next";
import path from "path";

const isDev = process.env.NODE_ENV === "development";
const FIREBASE_AUTH_HOST = "https://ryven-4cbd5.firebaseapp.com";

const nextConfig: NextConfig = {
  // Static export is only produced for production builds (served by Express).
  // In dev it is disabled so the Firebase auth rewrites below can run.
  ...(isDev ? {} : { output: 'export' as const }),
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
  // Dev-only: mirror middleware/firebaseAuthProxy.js so full-window Google
  // sign-in works on http://localhost:3000 (same-origin authDomain).
  ...(isDev
    ? {
        async rewrites() {
          return [
            { source: "/__/auth/:path*", destination: `${FIREBASE_AUTH_HOST}/__/auth/:path*` },
            { source: "/__/firebase/:path*", destination: `${FIREBASE_AUTH_HOST}/__/firebase/:path*` },
          ];
        },
      }
    : {}),
};

export default nextConfig;
