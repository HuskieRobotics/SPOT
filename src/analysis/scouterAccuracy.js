const fs = require("fs");
const path = require("path");

const DEFAULT_SCORING_CONFIG = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../config/scouter-accuracy-2025.json"),
    "utf8",
  ),
);

function normalizeScoringRules(scoringConfig) {
  const actions =
    scoringConfig && typeof scoringConfig.actions === "object"
      ? scoringConfig.actions
      : scoringConfig;

  if (!actions || typeof actions !== "object") return {};

  return Object.fromEntries(
    Object.entries(actions)
      .filter(
        ([actionId, points]) =>
          typeof actionId === "string" &&
          actionId.length > 0 &&
          Number.isFinite(Number(points)),
      )
      .map(([actionId, points]) => [actionId, Number(points)]),
  );
}

function calculatePredictedScore(actionQueue, scoringConfig) {
  const rules = normalizeScoringRules(scoringConfig);
  const actionCounts = {};
  let total = 0;

  for (const action of Array.isArray(actionQueue) ? actionQueue : []) {
    if (!action || typeof action.id !== "string") continue;
    const actionId = action.baseId || action.id;
    const ruleId =
      Object.prototype.hasOwnProperty.call(rules, actionId)
        ? actionId
        : Object.keys(rules).find((configuredId) =>
            action.id.toLowerCase().endsWith(configuredId.toLowerCase()),
          );
    actionCounts[actionId] = (actionCounts[actionId] || 0) + 1;
    total += ruleId ? rules[ruleId] : 0;
  }

  return { total, actionCounts };
}

function getHistoricalWeight(scouter) {
  if (!scouter || scouter.matches === 0) return 1;
  return Math.max(scouter.absoluteError / scouter.matches, 0.01);
}

function calculateScouterAccuracy(records, officialMatches, scoringConfig) {
  const rules = normalizeScoringRules(scoringConfig);
  const matches = new Map(
    officialMatches
      .filter(
        (match) =>
          match &&
          typeof match.key === "string" &&
          match.alliances &&
          match.alliances.red?.score >= 0 &&
          match.alliances.blue?.score >= 0,
      )
      .map((match) => [match.key, match]),
  );
  const reportsByMatch = new Map();
  const scouters = new Map();

  for (const record of records) {
    const matchKey = record.matchKey;
    const scouterId = record.scouterId;
    if (!matchKey || !scouterId || !matches.has(matchKey)) continue;

    const match = matches.get(matchKey);
    const robotNumber = String(record.robotNumber);
    const alliance = ["red", "blue"].find((color) =>
      (match.alliances[color].team_keys || []).some(
        (teamKey) => teamKey.replace(/^frc/, "") === robotNumber,
      ),
    );
    if (!alliance) continue;

    const report = {
      scouterId,
      robotNumber,
      alliance,
      predictedScore: calculatePredictedScore(
        record.actionQueue,
        record.scoringRules &&
          Object.keys(record.scoringRules).length > 0
          ? record.scoringRules
          : rules,
      ).total,
    };
    const matchReports = reportsByMatch.get(matchKey) || [];
    matchReports.push(report);
    reportsByMatch.set(matchKey, matchReports);
    if (!scouters.has(scouterId)) {
      scouters.set(scouterId, {
        scouterId,
        matches: 0,
        absoluteError: 0,
        signedBias: 0,
        accuracyTotal: 0,
      });
    }
  }

  const sortedMatches = [...reportsByMatch.entries()].sort(([a], [b]) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  const processedMatches = [];

  for (const [matchKey, reports] of sortedMatches) {
    const match = matches.get(matchKey);
    for (const alliance of ["red", "blue"]) {
      const expectedTeams = new Set(
        (match.alliances[alliance].team_keys || []).map((teamKey) =>
          teamKey.replace(/^frc/, ""),
        ),
      );
      const allianceReports = reports.filter(
        (report) =>
          report.alliance === alliance && expectedTeams.has(report.robotNumber),
      );
      const reportByRobot = new Map();
      for (const report of allianceReports) {
        if (!reportByRobot.has(report.robotNumber)) {
          reportByRobot.set(report.robotNumber, report);
        }
      }
      const uniqueRobots = new Set(reportByRobot.keys());
      if (uniqueRobots.size !== expectedTeams.size) continue;
      const selectedReports = [...reportByRobot.values()];

      const predictedScore = selectedReports.reduce(
        (total, report) => total + report.predictedScore,
        0,
      );
      const officialScore = match.alliances[alliance].score;
      const residual = officialScore - predictedScore;
      const weights = selectedReports.map((report) =>
        getHistoricalWeight(scouters.get(report.scouterId)),
      );
      const totalWeight = weights.reduce((total, weight) => total + weight, 0);

      selectedReports.forEach((report, index) => {
        const attributedError = residual * (weights[index] / totalWeight);
        const stats = scouters.get(report.scouterId);
        const absoluteError = Math.abs(attributedError);
        stats.matches += 1;
        stats.absoluteError += absoluteError;
        stats.signedBias += attributedError;
        stats.accuracyTotal += Math.max(
          0,
          100 * (1 - absoluteError / Math.max(officialScore, 1)),
        );
      });

      processedMatches.push({
        matchKey,
        alliance,
        predictedScore,
        officialScore,
        residual,
        scouters: selectedReports.map((report) => report.scouterId),
      });
    }
  }

  return {
    scoringVersion: scoringConfig?.version || 1,
    matches: processedMatches,
    scouters: [...scouters.values()]
      .map((stats) => ({
        scouterId: stats.scouterId,
        matches: stats.matches,
        averageAttributedError:
          stats.matches > 0 ? stats.absoluteError / stats.matches : 0,
        signedBias: stats.matches > 0 ? stats.signedBias / stats.matches : 0,
        accuracy:
          stats.matches > 0 ? stats.accuracyTotal / stats.matches : null,
        confidence:
          stats.matches >= 10
            ? "high"
            : stats.matches >= 5
              ? "medium"
              : "low",
      }))
      .sort((a, b) => (b.accuracy || 0) - (a.accuracy || 0)),
  };
}

module.exports = {
  normalizeScoringRules,
  calculatePredictedScore,
  calculateScouterAccuracy,
  DEFAULT_SCORING_CONFIG,
};
