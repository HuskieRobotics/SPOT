/**
 * The scouting-screen preview (#322, gate K-5): a season's match-scouting.json drawn as the
 * scouting screen, to play a match on with no server, sessions or sync. A student edits the file,
 * saves, and reloads the page.
 *
 * The files are read from disk on every request (docs/spec/15, "Configuration storage"), so the
 * page shows the file as saved, with no rebuild. `?season=2025` picks a folder under
 * `config/seasons/`; without it the page shows the active configuration in `config/`.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import type { Finding } from "@/config/check";
import { ACTIVE_SEASON, listSeasons, loadMatchScouting, readSeason } from "@/config/load";
import { cn } from "@/lib/utils";
import { ScoutingPreview } from "./preview";

export const metadata: Metadata = {
  title: "Scouting-screen preview · SPOT",
  description: "Play a match on a season's scouting screen, as a scouter will see it.",
};

const seasonLabel = (name: string) => (name === ACTIVE_SEASON ? "Active (config/)" : name);

function Findings({ folder, findings }: { folder: string; findings: Finding[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {findings.map((f, i) => (
        <li key={i} className="bg-card rounded-md border p-3 text-sm">
          <p className="font-mono text-xs">
            {folder}/{f.file}.json{f.line ? `:${f.line}:${f.column}` : ""}{" "}
            <span
              className={cn(
                "font-semibold",
                f.severity === "error" ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {f.severity}
            </span>{" "}
            {f.where}
          </p>
          <p className="mt-1">{f.message}</p>
          {f.hint && <p className="text-muted-foreground mt-1">{f.hint}</p>}
        </li>
      ))}
    </ul>
  );
}

export default async function ScoutingPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection(); // read the files when the page is requested, never at build time
  const query = await searchParams;
  const requested = typeof query.season === "string" ? query.season : ACTIVE_SEASON;
  const seasons = listSeasons();
  const season = seasons.find((s) => s.name === requested);

  let body: React.ReactNode;
  if (!season) {
    body = (
      <p>
        There is no season called “{requested}”. A season is the <code>config/</code> folder, or a
        folder under <code>config/seasons/</code> that has a <code>match-scouting.json</code>. Pick
        one above.
      </p>
    );
  } else {
    const { config, errors, warnings, version } = loadMatchScouting(
      readSeason(season)["match-scouting"],
    );
    if (!config) {
      const one = errors.length === 1;
      body = (
        <section aria-label="Configuration errors" className="flex flex-col gap-3">
          <p>
            <strong>
              {errors.length} {one ? "error" : "errors"}
            </strong>{" "}
            in <code>{season.folder}/match-scouting.json</code> {one ? "keeps" : "keep"} the screen
            from being drawn. Fix {one ? "it" : "them"}, save, and reload this page.{" "}
            <code>npm run config:check</code> lists the same.
          </p>
          <Findings folder={season.folder} findings={errors} />
        </section>
      );
    } else {
      // A changed file starts a fresh match: the key changes with the file's contents.
      body = (
        <>
          {warnings.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer">
                {warnings.length} {warnings.length === 1 ? "warning" : "warnings"} in{" "}
                <code>{season.folder}/match-scouting.json</code>
              </summary>
              <div className="mt-2">
                <Findings folder={season.folder} findings={warnings} />
              </div>
            </details>
          )}
          <ScoutingPreview key={`${season.name}:${version}`} config={config} />
        </>
      );
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[100rem] flex-col gap-3 p-3 sm:p-4">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="text-xl font-bold">Scouting-screen preview</h1>
        <nav aria-label="Seasons" className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {seasons.map((s) => (
            <Link
              key={s.name}
              href={
                s.name === ACTIVE_SEASON
                  ? "/scouting-preview"
                  : `/scouting-preview?season=${encodeURIComponent(s.name)}`
              }
              aria-current={s.name === season?.name ? "page" : undefined}
              className={cn(
                "underline-offset-4 hover:underline",
                s.name === season?.name ? "font-semibold" : "text-muted-foreground",
              )}
            >
              {seasonLabel(s.name)}
            </Link>
          ))}
        </nav>
        {season && (
          <p className="text-muted-foreground font-mono text-xs">
            {season.folder}/match-scouting.json
          </p>
        )}
      </header>
      {body}
    </main>
  );
}
