/**
 * Admin sign-in (SEC-4). `src/proxy.ts` sends an admin page here when there is no session,
 * with `?next=` naming the page to return to.
 */
import type { Metadata } from "next";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Admin sign-in · SPOT",
};

/** Only a path on this site, so the link cannot send an admin somewhere else. */
function safeNext(next: string | string[] | undefined): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/admin";
}

export default async function AdminSignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold tracking-tight">SPOT admin</h1>
      <SignInForm next={safeNext(next)} />
    </main>
  );
}
