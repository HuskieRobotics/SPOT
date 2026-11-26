/**
 * The analysis dashboard (docs/spec/08, #383): every event's scouting data, team by team. Anyone
 * may open it (SEC-1). `?event=<code>&team=<team>` opens an event and a team.
 */
import type { Metadata } from "next";
import { AnalysisClient } from "@/components/analysis/analysis-client";

export const metadata: Metadata = {
  title: "Analysis · SPOT",
};

export default function AnalysisPage() {
  return <AnalysisClient />;
}
