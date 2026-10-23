import type { NextConfig } from "next";

// Cache Components is intentionally OFF: every page reads the Supabase session
// cookie, and the classic dynamic-rendering model is simpler for this project.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
