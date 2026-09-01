import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root: without it, a stray lockfile in a parent
    // directory can make Turbopack pick the wrong root on some machines.
    root: __dirname,
  },
};

export default nextConfig;
