/**
 * The edit page (#410; document 07 AD-10 to AD-15, SEC-5): an event's records, to flag for review,
 * delete, or make the one analysis uses. `src/proxy.ts` lets only a signed-in admin reach it.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { EditRecords } from "./edit-records";

export const metadata: Metadata = {
  title: "Edit data · SPOT admin",
};

export default function EditPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Edit data</h1>
        <nav className="flex items-center gap-4">
          <Link href="/admin" className="text-primary underline-offset-4 hover:underline">
            Admin
          </Link>
          <Link href="/analysis" className="text-primary underline-offset-4 hover:underline">
            Analysis
          </Link>
        </nav>
      </header>
      <EditRecords />
    </main>
  );
}
