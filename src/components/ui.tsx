"use client";
/* Small design-system primitives (Tailwind + theme tokens from globals.css). */
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-contrast hover:brightness-110 shadow-sm",
  secondary: "bg-surface text-text border border-border hover:bg-surface-2",
  ghost: "text-text hover:bg-surface-2",
  subtle: "bg-accent-soft text-accent hover:brightness-95",
  danger: "bg-danger text-white hover:brightness-110",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" | "icon" }) {
  const sizes = { sm: "h-8 px-2.5 text-xs gap-1.5", md: "h-9 px-3.5 text-sm gap-2", lg: "h-11 px-5 text-base gap-2", icon: "h-8 w-8 justify-center" };
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex items-center rounded-lg font-medium transition disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
        variants[variant],
        sizes[size],
        className,
      )}
    />
  );
}

export function Card({ className, children, title, actions, description }: { className?: string; children?: ReactNode; title?: ReactNode; actions?: ReactNode; description?: ReactNode }) {
  return (
    <section className={cx("rounded-xl border border-border bg-surface shadow-[var(--shadow)]", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Full width unless the caller sets its own width (w-*). */
const widthOf = (className?: string) => (/(^|\s)w-/.test(className ?? "") ? "" : "w-full");
const inputBase = "rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-muted/70 focus:border-accent focus:outline-none";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputBase, widthOf(className), "h-9", className)} />;
}

export function NumberInput({ value, onChange, className, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { value: number | null | undefined; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value === null || value === undefined ? "" : String(value));
  useEffect(() => {
    if (Number(text) !== value && !(text === "" && (value === null || value === undefined))) setText(value === null || value === undefined ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      inputMode="decimal"
      {...props}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = e.target.value.trim() === "" ? null : Number(e.target.value);
        if (n === null || Number.isFinite(n)) onChange(n);
      }}
      className={cx(inputBase, widthOf(className), "h-9", className)}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputBase, widthOf(className), "py-2 font-mono text-xs", className)} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cx(inputBase, widthOf(className), "h-9 pr-8", className)}>
      {children}
    </select>
  );
}

export function Field({ label, help, children, className }: { label: ReactNode; help?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("flex flex-col gap-1", className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {help && <span className="text-[11px] leading-snug text-muted">{help}</span>}
    </label>
  );
}

export function Switch({ checked, onChange, label, help }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; help?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        type="button"
        onClick={() => onChange(!checked)}
        className={cx("relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition", checked ? "bg-accent" : "bg-border")}
      >
        <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </button>
      {(label || help) && (
        <label htmlFor={id} className="cursor-pointer">
          <div className="text-sm">{label}</div>
          {help && <div className="text-xs text-muted">{help}</div>}
        </label>
      )}
    </div>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "accent" | "success" | "danger" | "warning"; className?: string }) {
  const tones = {
    neutral: "bg-surface-2 text-muted",
    accent: "bg-accent-soft text-accent",
    success: "bg-success-soft text-success",
    danger: "bg-danger-soft text-danger",
    warning: "bg-warning-soft text-warning",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold", tones[tone], className)}>{children}</span>;
}

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; badge?: ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cx("flex gap-1 overflow-x-auto rounded-lg bg-surface-2 p-1", className)}>
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          type="button"
          onClick={() => onChange(it.value)}
          className={cx(
            "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition",
            value === it.value ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text",
          )}
        >
          {it.label}
          {it.badge}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose?: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open || !onClose) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div role="dialog" aria-modal className={cx("fade-in flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-border bg-surface shadow-2xl sm:rounded-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-md")}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-base font-semibold">{title}</h2>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              ✕
            </Button>
          )}
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Promise-based confirm dialog (window.confirm is unreliable inside installed PWAs). */
export function useConfirm() {
  const [state, setState] = useState<{ title: string; body?: ReactNode; danger?: boolean; confirmLabel?: string; resolve: (v: boolean) => void } | null>(null);
  const confirm = useCallback(
    (title: string, opts: { body?: ReactNode; danger?: boolean; confirmLabel?: string } = {}) => new Promise<boolean>((resolve) => setState({ title, ...opts, resolve })),
    [],
  );
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  const dialog = (
    <Modal
      open={!!state}
      onClose={() => close(false)}
      title={state?.title}
      footer={
        <>
          <Button onClick={() => close(false)}>Cancel</Button>
          <Button variant={state?.danger ? "danger" : "primary"} onClick={() => close(true)}>
            {state?.confirmLabel ?? "Confirm"}
          </Button>
        </>
      }
    >
      <div className="text-sm text-muted">{state?.body}</div>
    </Modal>
  );
  return { confirm, dialog };
}

// ---------------------------------------------------------------- toasts

type Toast = { id: number; tone: "success" | "danger" | "info"; text: string };
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const n = useRef(0);
  const push = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = ++n.current;
    setToasts((t) => [...t.slice(-3), { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "danger" ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "fade-in pointer-events-auto max-w-md rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg",
              t.tone === "success" && "bg-success text-white",
              t.tone === "danger" && "bg-danger text-white",
              t.tone === "info" && "bg-text text-bg",
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

export function Spinner({ className }: { className?: string }) {
  return <span className={cx("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)} />;
}

export function Empty({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-10 text-center">
      <div className="text-sm font-medium">{title}</div>
      {children && <div className="max-w-sm text-xs text-muted">{children}</div>}
    </div>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const toggle = () => {
    const dark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {}
    window.dispatchEvent(new Event("spot-theme"));
  };
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle dark mode" className={className}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    </Button>
  );
}

/** Fetch JSON with a readable error. */
export async function api<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.json !== undefined ? { "Content-Type": "application/json" } : {}), ...(init?.headers || {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`) as Error & { status?: number; data?: any };
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

/** Pick a readable text color for a background. */
export function contrastText(bg: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return bg === "transparent" ? "var(--text)" : "#fff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 165 ? "#111827" : "#ffffff";
}
