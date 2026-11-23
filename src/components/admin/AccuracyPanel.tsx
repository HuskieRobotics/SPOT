"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Empty, Select, api, cx } from "@/components/ui";
import type { AllianceResult, ScouterAccuracy } from "@/lib/scoring";

interface Result {
  scoringVersion: number;
  matches: AllianceResult[];
  scouters: ScouterAccuracy[];
  diagnostics: { recordsConsidered: number; recordsMatchedToTba: number; officialMatches: number; tbaEventKey: string; pointMapSize: number };
}

/**
 * Scouted points (from the project's point map) per alliance vs. the official TBA score.
 * The difference is shared among that alliance's scouters, weighted by each scouter's past error.
 */
export function AccuracyPanel() {
  const [data, setData] = useState<Result | null>(null);
  const [points, setPoints] = useState<"snapshot" | "current">("snapshot");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    api<Result>(`/api/admin/accuracy?points=${points}`)
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [points]); // eslint-disable-line react-hooks/exhaustive-deps

  const tone = (a: number | null) => (a === null ? "neutral" : a >= 90 ? "success" : a >= 75 ? "warning" : "danger");
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted">
          Each alliance&apos;s scouted points are compared with its official score from The Blue Alliance. Set point values for each button in the
          project builder&apos;s <b>Scoring</b> tab. An alliance counts only when all of its robots were scouted and the match has an official score.
        </p>
        <div className="flex items-center gap-2">
          <Select value={points} onChange={(e) => setPoints(e.target.value as "snapshot" | "current")} className="w-auto">
            <option value="snapshot">Points saved with each match</option>
            <option value="current">Re-score with current points</option>
          </Select>
          <Button onClick={load} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Scouted matches" value={data.diagnostics.recordsConsidered} />
            <Stat label="Matched to TBA" value={data.diagnostics.recordsMatchedToTba} />
            <Stat label="Alliances compared" value={data.matches.length} />
            <Stat label="Actions with points" value={data.diagnostics.pointMapSize} />
          </div>
          <Card title="Scouters" description="Accuracy = 100% − attributed error as a share of the official score, averaged over alliances. Bias > 0 means the scouter under-counts.">
            {data.scouters.length === 0 ? (
              <Empty title="No completed alliances yet">
                {data.diagnostics.officialMatches === 0
                  ? `No official results from TBA for ${data.diagnostics.tbaEventKey || "this event"} yet.`
                  : "All three robots of an alliance must be scouted before it can be compared."}
              </Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr className="border-b border-border">
                      <th className="px-4 py-2 font-medium">Scouter</th>
                      <th className="px-4 py-2 font-medium">Accuracy</th>
                      <th className="px-4 py-2 font-medium">Alliances</th>
                      <th className="px-4 py-2 font-medium">Avg error (pts)</th>
                      <th className="px-4 py-2 font-medium">Bias (pts)</th>
                      <th className="px-4 py-2 font-medium">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.scouters.map((s) => (
                      <tr key={s.scouterId}>
                        <td className="px-4 py-2 font-medium">{s.scouterId}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2">
                              <div className={cx("h-full rounded-full", { success: "bg-success", warning: "bg-warning", danger: "bg-danger", neutral: "bg-muted" }[tone(s.accuracy)])} style={{ width: `${Math.max(0, s.accuracy ?? 0)}%` }} />
                            </div>
                            <span className="tabular-nums">{s.accuracy === null ? "—" : `${s.accuracy.toFixed(1)}%`}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 tabular-nums">{s.matches}</td>
                        <td className="px-4 py-2 tabular-nums">{s.averageAttributedError.toFixed(1)}</td>
                        <td className="px-4 py-2 tabular-nums">{s.signedBias > 0 ? "+" : ""}{s.signedBias.toFixed(1)}</td>
                        <td className="px-4 py-2">
                          <Badge tone={s.confidence === "high" ? "success" : s.confidence === "medium" ? "warning" : "neutral"}>{s.confidence}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          {data.matches.length > 0 && (
            <Card title="Alliance results">
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
                    <tr className="border-b border-border">
                      <th className="px-4 py-2 font-medium">Match</th>
                      <th className="px-4 py-2 font-medium">Alliance</th>
                      <th className="px-4 py-2 font-medium">Scouted</th>
                      <th className="px-4 py-2 font-medium">Official</th>
                      <th className="px-4 py-2 font-medium">Difference</th>
                      <th className="px-4 py-2 font-medium">Scouters</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.matches.map((m) => (
                      <tr key={m.matchKey + m.alliance}>
                        <td className="px-4 py-1.5">{m.matchKey.split("_").pop()}</td>
                        <td className={cx("px-4 py-1.5 font-medium", m.alliance === "red" ? "text-red-alliance" : "text-blue-alliance")}>{m.alliance}</td>
                        <td className="px-4 py-1.5 tabular-nums">{m.predictedScore}</td>
                        <td className="px-4 py-1.5 tabular-nums">{m.officialScore}</td>
                        <td className={cx("px-4 py-1.5 tabular-nums", Math.abs(m.residual) > m.officialScore * 0.25 && "font-semibold text-danger")}>
                          {m.residual > 0 ? "+" : ""}
                          {m.residual}
                        </td>
                        <td className="px-4 py-1.5 text-xs text-muted">{m.scouters.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
