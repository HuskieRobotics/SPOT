"use client";

/**
 * The sign-in screen, rendered in the browser only: it starts from what the device remembers
 * (`localStorage`), which the server cannot know.
 */
import dynamic from "next/dynamic";

export const SignInClient = dynamic(() => import("./sign-in-screen").then((m) => m.SignInScreen), {
  ssr: false,
  loading: () => <p>Loading…</p>,
});
