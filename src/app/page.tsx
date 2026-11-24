/**
 * The scouting client (docs/spec/05, #359): sign in, wait to be assigned, scout, submit. The admin
 * page's QR code opens it with the join code filled in (`/?join=K7QF2M`, SEC-3b).
 */
import type { Metadata } from "next";
import { ScoutingClient } from "@/components/scouter/scouting-client";

export const metadata: Metadata = {
  title: "SPOT",
};

export default function Home() {
  return <ScoutingClient />;
}
