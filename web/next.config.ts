import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  // The shared package ships TypeScript source rather than a build step.
  transpilePackages: ["@horizm/contracts"],

  /**
   * The API is a separate service, but the browser only ever sees this origin. That
   * keeps the session cookie first-party and means no CORS configuration anywhere.
   */
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_ORIGIN}/:path*` },
      { source: "/media/:path*", destination: `${API_ORIGIN}/media/:path*` },
    ];
  },
};

export default nextConfig;
