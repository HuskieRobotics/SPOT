"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Badge, Button, Field, Input, Spinner, ThemeToggle, api, cx, useToast } from "@/components/ui";

export type AdminSection = "live" | "projects" | "data" | "accuracy" | "settings";

const NAV: { id: AdminSection; label: string; icon: string }[] = [
  { id: "live", label: "Live scouting", icon: "M3 12h4l3 8 4-16 3 8h4" },
  { id: "projects", label: "Projects & builder", icon: "M4 5h16v4H4zM4 11h7v8H4zM13 11h7v8h-7z" },
  { id: "data", label: "Match data", icon: "M4 6h16M4 12h16M4 18h10" },
  { id: "accuracy", label: "Scouter accuracy", icon: "M12 3v18M5 10l7-7 7 7" },
  { id: "settings", label: "Event & settings", icon: "M4 7h9M17 7h3M15 5v4M4 17h3M11 17h9M9 15v4" },
];

/** Signs the admin in with the access code (cookie session), then renders the dashboard. */
export function AdminGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "signin" | "ok">("loading");
  const [demo, setDemo] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api("/api/auth")
      .then((a) => {
        setDemo(a.demo);
        setState(a.admin ? "ok" : "signin");
      })
      .catch(() => setState("signin"));
  }, []);

  if (state === "loading")
    return (
      <div className="flex h-dvh items-center justify-center">
        <Spinner className="text-muted" />
      </div>
    );
  if (state === "signin")
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <form
          className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow)]"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api("/api/auth", { method: "POST", json: { code } });
              setState("ok");
            } catch (err) {
              toast((err as Error).message, "danger");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="mb-5 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/logo.svg" alt="" className="h-10 w-10 dark:invert" />
            <div>
              <h1 className="font-semibold">SPOT Admin</h1>
              <p className="text-xs text-muted">Enter the access code to continue</p>
            </div>
          </div>
          <Field label="Access code">
            <Input type="password" autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" className="mt-4 w-full justify-center" disabled={busy || !code}>
            {busy ? <Spinner /> : "Sign in"}
          </Button>
          <a href="/" className="mt-4 block text-center text-xs text-muted hover:text-text">
            ← Back to scouting
          </a>
        </form>
      </div>
    );
  return <DemoContext demo={demo}>{children}</DemoContext>;
}

function DemoContext({ demo, children }: { demo: boolean; children: ReactNode }) {
  return (
    <>
      {demo && <div className="bg-warning px-4 py-1 text-center text-xs font-semibold text-white">DEMO MODE — sign-in disabled, deleting data is blocked</div>}
      {children}
    </>
  );
}

export function AdminLayout({ section, onSection, children, title, actions }: { section: AdminSection | null; onSection: (s: AdminSection) => void; children: ReactNode; title?: ReactNode; actions?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-dvh">
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-surface transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-2.5 px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/logo.svg" alt="" className="h-8 w-8 dark:invert" />
          <div>
            <div className="text-sm font-bold leading-none">SPOT</div>
            <div className="text-[11px] text-muted">Admin</div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-2">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => {
                onSection(n.id);
                setOpen(false);
              }}
              className={cx(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition",
                section === n.id ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
                <path d={n.icon} />
              </svg>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="flex flex-col gap-0.5 border-t border-border px-2 py-3 text-sm">
          <a href="/" className="rounded-lg px-3 py-2 text-muted hover:bg-surface-2 hover:text-text">
            Scouting app ↗
          </a>
          <a href="/analysis" className="rounded-lg px-3 py-2 text-muted hover:bg-surface-2 hover:text-text">
            Analysis ↗
          </a>
          <div className="flex items-center justify-between px-1 pt-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await api("/api/auth", { method: "DELETE" });
                location.reload();
              }}
            >
              Sign out
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-bg/85 px-4 py-3 backdrop-blur">
          <Button size="icon" variant="ghost" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Menu">
            ☰
          </Button>
          <div className="min-w-0 flex-1 truncate text-base font-semibold">{title ?? NAV.find((n) => n.id === section)?.label}</div>
          {actions}
        </header>
        <main className="flex-1 px-4 py-5 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

export function StatusPill({ status, connected }: { status: number; connected: boolean }) {
  if (status === 4) return <Badge tone="danger">Removed</Badge>;
  if (!connected && status !== 3) return <Badge tone="danger">Disconnected</Badge>;
  return [<Badge key={0}>Signed out</Badge>, <Badge key={1} tone="warning">Waiting</Badge>, <Badge key={2} tone="accent">Scouting</Badge>, <Badge key={3} tone="success">Done</Badge>][status] ?? null;
}
