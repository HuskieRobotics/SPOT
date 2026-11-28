/**
 * The QR scanner (#411; document 07 AD-18 to AD-21, OF-4, SEC-5): a scouting admin scans the code
 * of each match a phone scouted with no connection. `src/proxy.ts` lets only a signed-in admin
 * reach it; once opened online, it opens with no connection too (`VISITED_PAGES`).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Scanner } from "./scanner";

export const metadata: Metadata = {
  title: "QR scanner · SPOT admin",
};

export default function ScannerPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">QR scanner</h1>
        <nav className="flex items-center gap-4">
          <Link href="/admin" className="text-primary underline-offset-4 hover:underline">
            Admin
          </Link>
          <Link href="/admin/edit" className="text-primary underline-offset-4 hover:underline">
            Edit data
          </Link>
        </nav>
      </header>
      <Scanner />
    </main>
  );
}
