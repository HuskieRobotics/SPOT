/**
 * The web app manifest (SC-5, #361): what a phone needs to install SPOT on its home screen and
 * open it like an app, offline too. Served at `/manifest.webmanifest`.
 */
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SPOT",
    short_name: "SPOT",
    description: "Scouting Platforms On Time — FRC scouting by Team 3061 Huskie Robotics",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // v5's light background (#efefef, globals.css --bg).
    background_color: "#efefef",
    theme_color: "#efefef",
    icons: [
      { src: "/icons/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
