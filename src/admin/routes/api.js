const { Router } = require("express");
const ScoutingSync = require("../../scouting/scouting-sync")();

let router = Router();

router.get("/scouters", (req,res) => {
    res.json(ScoutingSync.getScouters())
});

router.post("/match", (req,res) => {
    ScoutingSync.setMatch(req.body);
    ScoutingSync.assignScouters();
    res.json(true);
});

module.exports = router;