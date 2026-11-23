import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SPOT Scouting",
    short_name: "SPOT",
    description: "FRC match scouting by Team 3061 Huskie Robotics",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0e1116",
    theme_color: "#1f7ae0",
    icons: [
      { src: "/icons/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
