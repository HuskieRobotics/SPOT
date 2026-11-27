"use client";

/**
 * The analysis dashboard, rendered in the browser only (docs/spec/15): it runs the pipeline on
 * data it fetches (TR-9), so there is nothing for the server to draw. It registers the service
 * worker, so a device that only ever opens this page still opens it offline (#390, OF-3).
 */
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { registerServiceWorker } from "@/offline/register";

const Dashboard = dynamic(() => import("./dashboard").then((m) => m.Dashboard), {
  ssr: false,
  loading: () => <p className="p-4">Loading…</p>,
});

export function AnalysisClient() {
  useEffect(registerServiceWorker, []);
  return <Dashboard />;
}
