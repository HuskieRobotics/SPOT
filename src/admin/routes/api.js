const { Router } = require("express");
const ScoutingSync = require("../../scouting/scouting-sync")();

let router = Router();

router.get("/scouters", (req,res) => {
    res.json(ScoutingSync.getScouters())
});

router.post("/setMatch", (req,res) => {
    ScoutingSync.setMatch(req.body);
    ScoutingSync.assignScouters();
    res.json(true);
});

router.get("/matches", async (req,res) => {
    res.json({
        "allMatches": await ScoutingSync.getMatches(),
        "currentMatch": ScoutingSync.match
    })
})
module.exports = router;