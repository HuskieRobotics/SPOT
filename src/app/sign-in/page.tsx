/**
 * Signing in to scout (#356). The scouting client (#359) will show the same screen before its
 * waiting page; until then it stands alone here. `/?join=CODE`, the link in the admin page's QR
 * code (SEC-3b), comes here with the code filled in.
 */
import type { Metadata } from "next";
import { SignInClient } from "@/components/scouter/sign-in-client";

export const metadata: Metadata = {
  title: "Sign in · SPOT",
};

export default function SignInPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <h1 className="text-3xl font-bold tracking-tight">Sign in to scout</h1>
      <SignInClient />
    </main>
  );
}
