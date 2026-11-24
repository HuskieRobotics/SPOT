/**
 * The admin page (#357): the event and its join code, the current match and the start, the
 * scouters, and the roster. `src/proxy.ts` lets only a signed-in admin reach it.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { AdminClient } from "./admin-client";
import { SignOutButton } from "./sign-out-button";

export const metadata: Metadata = {
  title: "Admin · SPOT",
};

export default function AdminPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">SPOT admin</h1>
        <nav className="flex items-center gap-4">
          <Link href="/admin/schedule" className="text-primary underline-offset-4 hover:underline">
            Match schedule
          </Link>
          <SignOutButton />
        </nav>
      </header>
      <AdminClient />
    </main>
  );
}
