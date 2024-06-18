const { Router } = require("express");
let router = Router();
const config = require("../../../config/config.json");
const { TeamMatchPerformance } = require("../../lib/db");

router.get("/auth", (req, res) => {
  if (config.secrets.ACCESS_CODE === "") {
    res.json({ status: 2 });
  } else if (config.secrets.ACCESS_CODE == req.headers.authorization) {
    res.json({ status: 1 });
  } else {
    res.json({ status: 0 });
  }
});

router.get("/data", async (req, res) => {
  res.json(await TeamMatchPerformance.find());
});

router.get("/matches", async (req, res) => {
  res.json({
    allMatches: await ScoutingSync.getMatches(),
    currentMatch: ScoutingSync.match,
  });
});
module.exports = router;
