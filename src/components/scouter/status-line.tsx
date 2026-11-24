/**
 * The status line's parts (SC-1, OF-7): the connection, always shown, and the match and team
 * once assigned, in the alliance's color (DV-17).
 */
import { cn } from "@/lib/utils";
import type { ConnectionStatus } from "@/scouter/connection";
import { matchText, type MatchKey } from "@/scouter/match";
import type { Alliance } from "@/sessions/registry";

const LABELS: Record<ConnectionStatus, string> = {
  connected: "Connected",
  disconnected: "Disconnected",
  "not-connected": "Not connected",
};

export function ConnectionLabel({ status, detail }: { status: ConnectionStatus; detail?: string }) {
  return (
    <span
      data-testid="connection"
      data-status={status}
      title={detail}
      className={cn(
        "shrink-0 font-medium",
        status === "connected" && "text-success",
        status === "disconnected" && "text-destructive",
        status === "not-connected" && "text-muted-foreground",
      )}
    >
      {LABELS[status]}
    </span>
  );
}

export function MatchLabel({ match, alliance }: { match: MatchKey; alliance: Alliance | null }) {
  return (
    <span
      data-testid="scouting-info"
      className={cn(
        "truncate rounded px-1.5 font-semibold",
        alliance === "red" && "bg-alliance-red text-black",
        alliance === "blue" && "bg-alliance-blue text-black",
      )}
    >
      {matchText(match)}
    </span>
  );
}
