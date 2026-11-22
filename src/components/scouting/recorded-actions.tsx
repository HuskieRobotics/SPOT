/**
 * The actions a match has recorded so far, exactly as analysis receives them (docs/spec/21 DV-1):
 * the button id, the time remaining in ms, and the period beside it. Newest first, so the last
 * press is always in view.
 */
import type { Action } from "@/data/types";

const FIELDS = ["id", "ts", "phase", "segment", "segmentKind", "segmentIndex", "other"] as const;

function Value({ value }: { value: unknown }) {
  if (value === null) return <span className="text-muted-foreground">null</span>;
  if (value === undefined) return null;
  return <>{typeof value === "object" ? JSON.stringify(value) : String(value)}</>;
}

export function RecordedActions({ actions }: { actions: Action[] }) {
  if (actions.length === 0) {
    return <p className="text-muted-foreground text-sm">No actions recorded yet.</p>;
  }
  const rows = actions.map((action, i) => ({ n: i + 1, action })).reverse();
  return (
    <div className="max-h-[60dvh] overflow-auto rounded-md border">
      <table className="w-full font-mono text-xs" aria-label="Recorded actions">
        <thead className="bg-muted sticky top-0">
          <tr>
            <th className="px-2 py-1 text-right font-medium">#</th>
            {FIELDS.map((f) => (
              <th key={f} className="px-2 py-1 text-left font-medium">
                {f}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ n, action }) => (
            <tr key={n} className="border-t">
              <td className="text-muted-foreground px-2 py-1 text-right">{n}</td>
              {FIELDS.map((f) => (
                <td key={f} className="px-2 py-1 whitespace-nowrap" data-field={f}>
                  <Value value={action[f]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
