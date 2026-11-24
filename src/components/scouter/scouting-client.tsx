"use client";

/**
 * The scouting client, rendered in the browser only: it starts from what the device remembers
 * (`localStorage`), which the server cannot know.
 */
import dynamic from "next/dynamic";

export const ScoutingClient = dynamic(() => import("./scouting-app").then((m) => m.ScoutingApp), {
  ssr: false,
  loading: () => <p className="p-4">Loading…</p>,
});
