import type { NextConfig } from "next";

const assetPrefix = process.env.NEXT_ASSET_PREFIX;

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  assetPrefix: assetPrefix || undefined,
};

export default nextConfig;
