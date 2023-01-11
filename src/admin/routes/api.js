const { Router } = require("express");
const ScoutingSync = require("../../scouting/scouting-sync")();
let router = Router();
const config = require("../../../config/config.json");
const { TeamMatchPerformance } = require("../../lib/db");


router.use((req,res,next) => {
    if (!ScoutingSync.initialized) {
        res.status(503).send("Scouting Sync not initialized yet!");
    } else {
        next()
    }
})

router.get("/auth", (req, res) => {
    if (config.secrets.ACCESS_CODE === "") {
        res.json({status: 2})
    } else if (config.secrets.ACCESS_CODE == req.headers.authorization) {
        res.json({status: 1})
    } else {
        res.json({status: 0})
    }
})

router.get("/scouters", (req,res) => {
    if (req.headers.authorization === config.secrets.ACCESS_CODE) {
        res.json(ScoutingSync.getScouters())
    } else {
        res.json({error: "Not Authorized"})
    }
});

router.get("/data", async (req,res) => {
    res.json(await TeamMatchPerformance.find());
})


router.get("/enterMatch", (req,res) => {
    if (req.headers.authorization === config.secrets.ACCESS_CODE) {
        for (let scouter of ScoutingSync.scouters) {
            if (scouter.state.status == ScoutingSync.SCOUTER_STATUS.WAITING)
                scouter.updateState({status: ScoutingSync.SCOUTER_STATUS.SCOUTING});
                scouter.socket.emit("enterMatch");
        }
        res.json(true);
    } else {
        res.json({error: "Not Authorized"})
    }
})
router.post("/setMatch", (req,res) => {
    if (req.headers.authorization === config.secrets.ACCESS_CODE) {
        ScoutingSync.setMatch(req.body);
        ScoutingSync.assignScouters();
        res.json(true);
    } else {
        res.json({error: "Not Authorized"})
    }
});

router.get("/matches", async (req,res) => {
	res.json({
		"allMatches": await ScoutingSync.getMatches(),
		"currentMatch": ScoutingSync.match
	})
})
module.exports = router;