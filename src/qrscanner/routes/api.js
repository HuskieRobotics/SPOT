const { Router } = require("express");
const { TeamMatchPerformance } = require("../../lib/db");
const ScoutingSync = require("../../scouting/scouting-sync")();
const config = require("../../../config/config.json");

const router = Router();
let previousMatchIDRand;

async function addAccuracyMetadata(data) {
  const match = (await ScoutingSync.getMatches()).find(
    (candidate) => candidate.number == data.matchNumber,
  );
  return {
    ...data,
    matchKey: data.matchKey || match?.match_string || null,
    scoringVersion:
      data.scoringVersion || config.SCOUTING_ACCURACY?.version || 1,
    scoringRules:
      data.scoringRules || config.SCOUTING_ACCURACY?.actions || {},
  };
}

router.post("/teamMatchPerformance", async (req, res) => {
  try {
    const duplicate = await TeamMatchPerformance.findOne({
      matchId_rand: req.body.matchId_rand,
    });

    console.log(duplicate);

    if (duplicate) {
      res.status(204).end();
      return;
    }
  } catch (err) {
    console.log(err);
    res.status(400).end();
    return;
  }

  let teamMatchPerformance;
  try {
    const data = await addAccuracyMetadata(req.body);
    teamMatchPerformance = new TeamMatchPerformance({
      ...data,
    });
  } catch (err) {
    console.log(err);
    res.status(400).end();
    return;
  }

  try {
    await teamMatchPerformance.save();
  } catch (err) {
    console.log(err);
    res.status(500).end();
    return;
  }

  previousMatchIDRand = req.body.matchId_rand;

  res.status(201).end();
});

router.post("/undo", async (req, res) => {
  try {
    await TeamMatchPerformance.deleteOne({ matchId_rand: previousMatchIDRand });
  } catch (err) {
    console.log(err);
    res.status(500).end();
    return;
  }
  res.status(200).end();
});

router.post("/sync", async (req, res) => {
  const syncTmps = req.body;

  try {
    const dbTmps = await TeamMatchPerformance.find({});

    for (const syncTmp of syncTmps) {
      let exists = false;

      database: for (const dbTmp of dbTmps) {
        if (
          syncTmp.robotNumber != dbTmp.robotNumber ||
          syncTmp.eventNumber != dbTmp.eventNumber ||
          syncTmp.matchNumber != dbTmp.matchNumber
        ) {
          continue;
        }

        if (syncTmp.actionQueue.length === dbTmp.actionQueue.length) {
          for (const index in syncTmp.actionQueue) {
            if (syncTmp.actionQueue[index].id !== dbTmp.actionQueue[index].id) {
              break database;
            }
          }

          exists = true;
        }
      }

      if (!exists) {
        try {
          const teamMatchPerformance = new TeamMatchPerformance(
            await addAccuracyMetadata(syncTmp),
          );
          await teamMatchPerformance.save();
        } catch (err) {
          console.log(err);
          res.status(400).end();
          return;
        }
      }
    }
  } catch (err) {
    console.log(err);
    res.status(400).end();
    return;
  }

  res.status(200).end();
});

module.exports = router;
