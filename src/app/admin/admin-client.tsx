"use client";

/**
 * The admin page's body, rendered in the browser only: everything on it comes from polling, and
 * the join code's QR link needs the address the admin opened SPOT at.
 */
import dynamic from "next/dynamic";

export const AdminClient = dynamic(() => import("./dashboard").then((m) => m.AdminDashboard), {
  ssr: false,
  loading: () => <p>Loading…</p>,
});
