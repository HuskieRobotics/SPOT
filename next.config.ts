import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` and `next build` must not share a folder: running one while the other is active
  // corrupts the manifests ("Could not find the module ... in the React Client Manifest").
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  // One long-running Node process owns the in-memory scouter registry (see docs).
  output: "standalone",
  serverExternalPackages: ["mongoose"],
  outputFileTracingIncludes: { "/**": ["./presets/**/*", "./config/config.example.json"] },
};

export default nextConfig;
