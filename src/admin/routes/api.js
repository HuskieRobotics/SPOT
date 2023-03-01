const { Router } = require("express");
const ScoutingSync = require("../../scouting/scouting-sync")();
let router = Router();
const config = require("../../../config/config.json");
const { TeamMatchPerformance } = require("../../lib/db");

const DEMO = false;

router.use((req,res,next) => {
    if (!ScoutingSync.initialized) {
        res.status(503).send("Scouting Sync not initialized yet!");
    } else {
        next()
    }
})

router.get("/auth", (req, res) => {
  if(!DEMO){
    if (config.secrets.ACCESS_CODE === "") {
        res.json({status: 2})
    } else if (config.secrets.ACCESS_CODE == req.headers.authorization) {
        res.json({status: 1})
    } else {
        res.json({status: 0})
    }
  } else {
    res.json({status: 2})
  }
})

router.get("/scouters", (req,res) => {
  if(!DEMO){
    if (req.headers.authorization === config.secrets.ACCESS_CODE) {
        res.json(ScoutingSync.getScouters())
    } else {
        res.json({error: "Not Authorized"})
    }
  } else {
    res.json(ScoutingSync.getScouters())
  }
});

router.get("/data", async (req,res) => {
    res.json(await TeamMatchPerformance.find());
})


router.get("/enterMatch", async (req,res) => {
  if(!DEMO){
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
  } else {
    let test = await ScoutingSync.getMatches()
     res.json({
        "allMatches": test,
        "currentMatch": ScoutingSync.match
    })
    for (let scouter of ScoutingSync.scouters) {
        if (scouter.state.status == ScoutingSync.SCOUTER_STATUS.WAITING)
            scouter.socket.emit("enterMatch");
    }
    // res.json();
  }
})
router.post("/setMatch", (req,res) => {
  if(!DEMO){
    if (req.headers.authorization === config.secrets.ACCESS_CODE) {
        ScoutingSync.setMatch(req.body);
        ScoutingSync.assignScouters();
        res.json(true);
    } else {
        res.json({error: "Not Authorized"})
    }
  } else {
    ScoutingSync.setMatch(req.body);
    ScoutingSync.assignScouters();
    res.json(true);
  }
});

router.get("/matches", async (req,res) => {
	res.json({
		"allMatches": await ScoutingSync.getMatches(),
		"currentMatch": ScoutingSync.match
	})
})
module.exports = router;