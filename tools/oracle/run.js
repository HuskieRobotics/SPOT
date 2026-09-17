#!/usr/bin/env node
/**
 * SPOT behavioral oracle harness.
 *
 * Runs a SPOT analysis pipeline headlessly against an exported set of TeamMatchPerformances
 * using the transformer code from ANY SPOT checkout (v4.2.0, HEAD, ...), and writes
 * normalized "golden" output that a rewrite can be compared against.
 *
 * It reimplements, version-independently:
 *   - the transformer bundling that src/analysis/analysis.js performs (marker extraction of
 *     __TMP__/__TEAM__ blocks, evaluated with DataTransformer/getPath/setPath/actionIds/
 *     matchScoutingConfig in scope);
 *   - the browser-side executePipeline (src/analysis/public/js/analysisPipeline.js) including
 *     the optional 2026-era TBA enrichment (score-breakdown synthetic actions + component OPRs).
 *
 * No database, no server, no npm dependencies.
 *
 * Usage:
 *   node tools/oracle/run.js \
 *     --checkout <path to SPOT checkout> \
 *     --tmps <mongoexport json> --events <mongoexport json> --event <event code> \
 *     [--config <dir>] [--pipeline <file>] [--match-scouting <file>] \
 *     [--tba <dir with matches.json,teams.json,coprs.json>] [--enrich] \
 *     [--opr-strings <json object or path>] \
 *     --out <dir>
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

// ---------------------------------------------------------------- args
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}
const args = parseArgs(process.argv);
function need(k) {
  if (!args[k]) {
    console.error(`missing --${k}`);
    process.exit(2);
  }
  return args[k];
}

const checkout = path.resolve(need("checkout"));
const configDir = path.resolve(args.config || path.join(checkout, "config"));
const pipelineFile = path.resolve(args.pipeline || path.join(configDir, "analysis-pipeline.json"));
const matchScoutingFile = path.resolve(
  args["match-scouting"] || path.join(configDir, "match-scouting.json"),
);
const tmpsFile = path.resolve(need("tmps"));
const eventsFile = path.resolve(need("events"));
const eventCode = need("event");
const outDir = path.resolve(need("out"));
const tbaDir = args.tba ? path.resolve(args.tba) : null;
const enrich = !!args.enrich;

// ---------------------------------------------------------------- mongoexport extended JSON
function fromExtendedJSON(v) {
  if (Array.isArray(v)) return v.map(fromExtendedJSON);
  if (v && typeof v === "object") {
    const keys = Object.keys(v);
    if (keys.length === 1) {
      const k = keys[0];
      if (k === "$oid") return v.$oid;
      if (
        k === "$numberLong" ||
        k === "$numberInt" ||
        k === "$numberDouble" ||
        k === "$numberDecimal"
      )
        return Number(v[k]);
      if (k === "$date") return typeof v.$date === "object" ? fromExtendedJSON(v.$date) : v.$date;
    }
    const out = {};
    for (const k of keys) out[k] = fromExtendedJSON(v[k]);
    return out;
  }
  return v;
}
function loadExport(file) {
  const raw = fs.readFileSync(file, "utf8").trim();
  let docs;
  try {
    docs = JSON.parse(raw);
    if (!Array.isArray(docs)) docs = [docs];
  } catch {
    docs = raw
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  }
  return docs.map(fromExtendedJSON);
}

// ---------------------------------------------------------------- inputs
const events = loadExport(eventsFile);
const event = events.find((e) => e.code === eventCode);
if (!event) {
  console.error(`event code ${eventCode} not found in ${eventsFile}`);
  process.exit(2);
}
const eventId = String(event._id);

let tmps = loadExport(tmpsFile).filter((t) => String(t.eventNumber) === eventId);
if (tmps.length === 0) {
  console.error(`no TMPs for event ${eventCode} (${eventId})`);
  process.exit(2);
}
// Match what the browser sees from /analysis/api/dataset: Mongoose JSON (ids are strings).
// We drop Mongo bookkeeping so golden files are stable across exports.
for (const t of tmps) {
  delete t.__v;
  for (const a of t.actionQueue) delete a._id;
}
// deterministic order (Mongo natural order ≈ insertion; sort by timestamp then matchId)
tmps.sort(
  (a, b) => a.timestamp - b.timestamp || String(a.matchId).localeCompare(String(b.matchId)),
);

const matchScoutingConfig = JSON.parse(fs.readFileSync(matchScoutingFile, "utf8"));
const pipelineConfig = JSON.parse(fs.readFileSync(pipelineFile, "utf8"));
const actionIds = matchScoutingConfig.layout.layers
  .flat()
  .reduce((acc, b) => (acc.includes(b.id) ? acc : acc.concat(b.id)), []);

let oprStrings = null;
if (args["opr-strings"]) {
  const v = String(args["opr-strings"]);
  oprStrings = fs.existsSync(v) ? JSON.parse(fs.readFileSync(v, "utf8")) : JSON.parse(v);
}

let tba = null;
if (tbaDir) {
  tba = {
    matches: JSON.parse(fs.readFileSync(path.join(tbaDir, "matches.json"), "utf8")),
    teams: JSON.parse(fs.readFileSync(path.join(tbaDir, "teams.json"), "utf8")),
    coprs: JSON.parse(fs.readFileSync(path.join(tbaDir, "coprs.json"), "utf8")),
  };
}

// ---------------------------------------------------------------- transformer registry (mirrors analysis.js)
function findFile(rel) {
  const p = path.join(checkout, rel);
  if (!fs.existsSync(p)) throw new Error(`expected ${rel} in checkout ${checkout}`);
  return p;
}
const transformersDir = findFile("src/analysis/transformers");
let types = [
  { name: "tmp", identifier: "TMP" },
  { name: "team", identifier: "TEAM" },
];
let ignore = [];
const atConfig = path.join(checkout, "config", "analysis-transformers.json");
if (fs.existsSync(atConfig)) {
  const at = JSON.parse(fs.readFileSync(atConfig, "utf8"));
  if (Array.isArray(at.types))
    types = at.types.map((t) => ({ name: t.name, identifier: t.identifier }));
  if (Array.isArray(at.ignore)) ignore = at.ignore;
}

const sandbox = { console, actionIds, matchScoutingConfig };
vm.createContext(sandbox);
// DataTransformer, getPath, setPath from the checkout itself (browser files; module guard keeps them global)
for (const rel of ["src/analysis/public/js/DataTransformer.js", "src/analysis/public/js/util.js"]) {
  vm.runInContext(fs.readFileSync(findFile(rel), "utf8"), sandbox, { filename: rel });
}
// util.js in the browser also defines createDOMElement/clearDiv using document; harmless unless called.

const transformers = {};
for (const t of types) transformers[t.name] = {};
const registryReport = [];
for (const file of fs.readdirSync(transformersDir).sort()) {
  if (ignore.includes(file) || file.endsWith(".template.js")) continue;
  const contents = fs.readFileSync(path.join(transformersDir, file), "utf8");
  for (const t of types) {
    const re = new RegExp(`__${t.identifier}__\\s*([\\s\\S]*?)\\s*__/${t.identifier}__`, "i");
    const m = re.exec(contents);
    if (!m) continue;
    const name = file.split(".")[0];
    try {
      transformers[t.name][name] = vm.runInContext(`(${m[1].trim()})`, sandbox, {
        filename: `${file}#${t.identifier}`,
      });
      registryReport.push({ file, type: t.name, name: transformers[t.name][name].name });
    } catch (e) {
      registryReport.push({ file, type: t.name, error: String(e) });
    }
  }
}

// ---------------------------------------------------------------- enrichment (mirrors analysisPipeline.js, 2026 code)
let checkoutCommit = null;
try {
  checkoutCommit = require("child_process")
    .execSync("git rev-parse --short HEAD", { cwd: checkout, stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim();
} catch {
  /* not a git checkout */
}
const report = {
  checkout,
  checkoutCommit,
  eventCode,
  eventId,
  tmpCount: tmps.length,
  enrich,
  unknownActionIds: [],
  transformerErrors: [],
  registry: registryReport,
};

function enrichWithTBA() {
  const tbaData = tba.matches;
  const tbaOPRS = tba.coprs;

  function getTBADataAllianceAndMatch(team, match) {
    let robotNum = "";
    let alliance = "";
    tbaData.forEach((item) => {
      if (item.comp_level == "qm" && item.match_number == match) {
        let i = 0;
        for (const blueTeam of item.alliances.blue.team_keys) {
          i++;
          if (blueTeam.substring(3) == team) {
            alliance = "blue";
            robotNum = i;
          }
        }
        i = 0;
        for (const redTeam of item.alliances.red.team_keys) {
          i++;
          if (redTeam.substring(3) == team) {
            alliance = "red";
            robotNum = i;
          }
        }
      }
    });
    return { robotNum, alliance };
  }
  function getTBADataAutoOrEnd(robotNum, alliance, match, typeString) {
    for (const item of tbaData) {
      if (item.comp_level == "qm" && item.match_number == match) {
        const breakdown = item.score_breakdown?.[alliance];
        if (!breakdown) return;
        for (const [key, value] of Object.entries(breakdown)) {
          if (key.startsWith(`${typeString}`) && key.endsWith(`${robotNum}`)) {
            return { actionName: key.substring(0, key.length - 1), action: value };
          }
        }
      }
    }
  }
  tmps.forEach((tmp) => {
    const ta = getTBADataAllianceAndMatch(tmp.robotNumber, tmp.matchNumber);
    const autoData = getTBADataAutoOrEnd(ta.robotNum, ta.alliance, tmp.matchNumber, "auto");
    const endGameData = getTBADataAutoOrEnd(ta.robotNum, ta.alliance, tmp.matchNumber, "endGame");
    if (autoData) tmp.actionQueue.push({ id: `${autoData.actionName}_${autoData.action}`, ts: 0 });
    if (endGameData)
      tmp.actionQueue.push({ id: `${endGameData.actionName}_${endGameData.action}`, ts: 0 });
  });

  return function attachOPR(teams) {
    if (!oprStrings || oprStrings.None) return;
    for (const [teamKey, value] of Object.entries(teams)) {
      for (const stringName of Object.values(oprStrings)) {
        let opr;
        for (const [coprKey, teamsValues] of Object.entries(tbaOPRS)) {
          if (coprKey == stringName) {
            for (const [tk, ov] of Object.entries(teamsValues)) {
              if (tk.substring(3) == teamKey) {
                opr = ov;
                break;
              }
            }
            break;
          }
        }
        sandbox.setPath(value, `opr.${stringName}`, opr);
      }
    }
  };
}

let attachOPR = null;
if (enrich) {
  if (!tba) {
    console.error("--enrich requires --tba");
    process.exit(2);
  }
  attachOPR = enrichWithTBA();
}

// ---------------------------------------------------------------- dataset (browser uses a sparse array; entries/keys semantics equal an object)
const teams = [];
for (const tmp of tmps) teams[tmp.robotNumber] = {};
if (attachOPR) attachOPR(teams);

// unknown-id report (ids in data not in the config's button ids)
{
  const known = new Set(actionIds);
  const seen = new Map();
  for (const t of tmps)
    for (const a of t.actionQueue) if (!known.has(a.id)) seen.set(a.id, (seen.get(a.id) || 0) + 1);
  report.unknownActionIds = [...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ id, count }));
}

let dataset = { tmps, teams };

// ---------------------------------------------------------------- run pipeline
const t0 = Date.now();
pipelineConfig.forEach((tf, index) => {
  const impl = transformers[tf.type] && transformers[tf.type][tf.name];
  if (!impl) {
    report.transformerErrors.push({
      index,
      type: tf.type,
      name: tf.name,
      outputPath: tf.outputPath,
      error: "transformer not found in checkout",
    });
    return;
  }
  try {
    const result = impl.execute(dataset, tf.outputPath, tf.options);
    if (result === undefined) {
      report.transformerErrors.push({
        index,
        type: tf.type,
        name: tf.name,
        outputPath: tf.outputPath,
        error: "transformer returned undefined (dataset kept)",
      });
    } else dataset = result;
  } catch (e) {
    report.transformerErrors.push({
      index,
      type: tf.type,
      name: tf.name,
      outputPath: tf.outputPath,
      error: String((e && e.stack) || e),
    });
  }
});
report.pipelineMs = Date.now() - t0;
report.pipelineEntries = pipelineConfig.length;

// manual hooks (src/analysis/manual/*.json) — mirror the merge; both ship empty
const manualDir = path.join(checkout, "src", "analysis", "manual");
if (fs.existsSync(manualDir)) {
  const mt = JSON.parse(fs.readFileSync(path.join(manualDir, "tmps.json"), "utf8"));
  const mteams = JSON.parse(fs.readFileSync(path.join(manualDir, "teams.json"), "utf8"));
  dataset.tmps = dataset.tmps.concat(mt.map((tmp) => ({ ...tmp, manual: true })));
  for (const [p, teamData] of Object.entries(mteams))
    for (const [team, value] of Object.entries(teamData)) {
      if (!(team in dataset.teams)) dataset.teams[team] = {};
      sandbox.setPath(dataset.teams[team], "manual." + p, value);
    }
}

// ---------------------------------------------------------------- normalize + write
function normalize(v) {
  if (typeof v === "number") {
    if (Number.isNaN(v)) return "__NaN__";
    if (v === Infinity) return "__Infinity__";
    if (v === -Infinity) return "__-Infinity__";
    return v;
  }
  if (v === undefined) return "__undefined__";
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = normalize(v[k]);
    return out;
  }
  return v;
}
const teamsObj = {};
for (const [k, v] of Object.entries(dataset.teams)) teamsObj[k] = v;

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "teams.json"), JSON.stringify(normalize(teamsObj), null, 1));
fs.writeFileSync(path.join(outDir, "tmps.json"), JSON.stringify(normalize(dataset.tmps), null, 1));
report.teamCount = Object.keys(teamsObj).length;
report.derivedTmpCount = dataset.tmps.length; // after the pipeline (e.g. removeDuplicates may drop re-scouts)
report.sampleTeamPaths = Object.keys(teamsObj).length
  ? Object.keys(teamsObj[Object.keys(teamsObj)[0]]).sort()
  : [];
fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));

console.log(`oracle: ${eventCode} @ ${path.basename(checkout)} -> ${outDir}`);
console.log(
  `  tmps=${tmps.length} (derived ${report.derivedTmpCount}) teams=${report.teamCount} pipeline=${pipelineConfig.length} entries in ${report.pipelineMs}ms enrich=${enrich}`,
);
console.log(
  `  unknown action ids: ${report.unknownActionIds.length}${
    report.unknownActionIds.length
      ? " -> " +
        report.unknownActionIds
          .slice(0, 8)
          .map((x) => `${x.id}(${x.count})`)
          .join(", ")
      : ""
  }`,
);
if (report.transformerErrors.length) {
  console.log(`  transformer errors: ${report.transformerErrors.length}`);
  for (const e of report.transformerErrors)
    console.log(
      `    [${e.index}] ${e.type}/${e.name} -> ${e.outputPath}: ${String(e.error).split("\n")[0]}`,
    );
}
