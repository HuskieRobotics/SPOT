/**
 * The match schedule (#355, D-4, AD-22 to AD-25a): TBA's, and one typed by hand for an event
 * TBA does not cover. `src/proxy.ts` lets only a signed-in admin reach it.
 */
import type { Metadata } from "next";
import { ScheduleEditor } from "./schedule-editor";

export const metadata: Metadata = {
  title: "Match schedule · SPOT admin",
};

export default function SchedulePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <h1 className="text-3xl font-bold tracking-tight">Match schedule</h1>
      <ScheduleEditor />
    </main>
  );
}
