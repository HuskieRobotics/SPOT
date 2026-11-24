"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SignInForm({ next }: { next: string }) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        window.location.assign(next);
        return;
      }
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      setMessage(body?.message ?? "Signing in failed. Try again.");
    } catch {
      setMessage("SPOT's server cannot be reached. Check the connection and try again.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={signIn} className="flex w-full max-w-xs flex-col gap-3">
      <label htmlFor="admin-password" className="text-sm font-medium">
        Admin password
      </label>
      <input
        id="admin-password"
        type="password"
        autoComplete="current-password"
        autoFocus
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="bg-background rounded-md border px-3 py-2"
      />
      <Button type="submit" disabled={busy || password === ""}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      {message && (
        <p role="alert" className="text-destructive text-sm">
          {message}
        </p>
      )}
    </form>
  );
}
