const { Router } = require("express");
const ScoutingSync = require("../../scouting/scouting-sync")();
let router = Router();
const config = require("../../../config/config.json");
const { TeamMatchPerformance } = require("../../lib/db");
let axios = require("axios")
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
    res.json();
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
//1 check if there is a manual schedu,e
//2 if there is a manual schedule, send it instead of the TBA one
//3 if there isnt send the TBA one
  let manualSchedule = await axios.get('http://localhost:8080/schedule/matches').then(res=>res.data) // temp fix
  if(Object.keys(manualSchedule).length != 0){ // find a better way to check if its empty
    res.json({
      "allMatches": manualSchedule,
      "currentMatch": ScoutingSync.match
    })
  } else {
    res.json({
      "allMatches": await ScoutingSync.getMatches(),
      "currentMatch": ScoutingSync.match
    })
  }
})
module.exports = router;