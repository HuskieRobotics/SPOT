const { Router } = require("express");
const { writeFileSync } = require("fs");
let router = Router();
const config = require("../../../config/config.json");

// for future use

router.post("/config", function(req, res) {
  try {
    writeFileSync("config/match-scouting.json", JSON.stringify(req.body, null, 2));
    res.send("Success").end()
  } catch(e) {
    console.error("Cannot apply configuration from editor", e);
    res.status(500).send("Failed").end()
  }
})

module.exports = router;