/**
 * The admin page. `src/proxy.ts` lets only a signed-in admin reach it. The event, match and
 * scouter panels arrive with #357.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { SignOutButton } from "./sign-out-button";

export const metadata: Metadata = {
  title: "Admin · SPOT",
};

export default function AdminPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-3xl font-bold tracking-tight">SPOT admin</h1>
      <p className="text-muted-foreground max-w-md text-balance">
        You are signed in. Choosing the event and match and watching scouters come with the admin
        page (#357).
      </p>
      <Link href="/admin/schedule" className="text-primary underline-offset-4 hover:underline">
        Match schedule
      </Link>
      <SignOutButton />
    </main>
  );
}
