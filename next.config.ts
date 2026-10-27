import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The demo is a pile of HTML. No server, no functions, no revalidation -
  // which is what makes it free to host and impossible to break by letting a
  // backend lapse. Every page is rendered once, at build time, against the
  // frozen snapshot in lib/demo/fixtures.ts.
  output: "export",

  // Image optimisation is a server feature. Without it next/image still works,
  // it just serves the file as-is, so the sources must already be the right
  // size - see public/product/.
  images: { unoptimized: true },

  // Static hosts serve /games/ from /games/index.html. Without this a visitor
  // who lands on a trailing-slash URL gets a 404.
  trailingSlash: true,

  turbopack: {
    // Pin the workspace root: without it, a stray lockfile in a parent
    // directory can make Turbopack pick the wrong root on some machines.
    root: __dirname,
  },
};

export default nextConfig;
