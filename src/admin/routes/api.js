const { Router } = require("express");
const ScoutingSync = require("../../scouting/scouting-sync")();
let router = Router();
const config = require("../../../config/config.json")


router.use((req,res,next) => {
    if (!ScoutingSync.initialized) {
        res.status(503).send("Scouting Sync not initialized yet!");
    } else {
        next()
    }
})

router.get("/auth", (req, res) => {
    res.json({status: 2})
})

router.get("/scouters", (req,res) => {
    res.json(ScoutingSync.getScouters())
});

router.get("/enterMatch", (req,res) => {
    for (let scouter of ScoutingSync.scouters) {
        if (scouter.state.status == ScoutingSync.SCOUTER_STATUS.WAITING)
            scouter.socket.emit("enterMatch");
    }
    res.json(true);
})

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