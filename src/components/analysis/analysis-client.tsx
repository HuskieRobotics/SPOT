"use client";

/**
 * The analysis dashboard, rendered in the browser only (docs/spec/15): it runs the pipeline on
 * data it fetches (TR-9), so there is nothing for the server to draw.
 */
import dynamic from "next/dynamic";

export const AnalysisClient = dynamic(() => import("./dashboard").then((m) => m.Dashboard), {
  ssr: false,
  loading: () => <p className="p-4">Loading…</p>,
});
