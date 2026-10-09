import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;

// Lets `next dev` access Cloudflare bindings. See https://opennext.js.org/cloudflare/get-started
initOpenNextCloudflareForDev();
