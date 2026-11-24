import type { NextConfig } from "next";
import { version } from "./package.json";

const nextConfig: NextConfig = {
  // The version the scouting client shows (SC-7) and records with each match (DV-1).
  env: { SPOT_VERSION: version },
};

export default nextConfig;
