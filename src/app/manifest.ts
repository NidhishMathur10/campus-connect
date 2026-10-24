import type { MetadataRoute } from "next";
import { APP_NAME } from "@/config/college";

// start_url "/" sends every signed-in role to its own home (the proxy redirects "/" via ROLE_HOME),
// and signed-out visitors to the landing page.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: "Report campus issues, track them to resolution, and get job alerts on your phone.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F8FAFC", // theme-ok (manifest cannot use CSS vars)
    theme_color: "#0F172A", // theme-ok
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
