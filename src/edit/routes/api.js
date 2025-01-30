const { Router } = require("express");
const { TeamMatchPerformance } = require("../../lib/db.js");
const axios = require("axios");
const config = require("../../../config/config.json");

let router = Router();

router.get("/dataset", async (req, res) => {
  res.json(
    await TeamMatchPerformance.find({ eventNumber: config.EVENT_NUMBER })
  );
});

module.exports = router;
