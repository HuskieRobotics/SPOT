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
    if (config.secrets.ACCESS_CODE === "") {
        res.json({status: 2})
    } else if (config.secrets.ACCESS_CODE == req.headers.authorization) {
        res.json({status: 1})
    } else {
        res.json({status: 0})
    }
})

router.get("/config", (req, res) => {
    if (config.secrets.ACCESS_CODE === "" || req.headers.authorization === config.secrets.ACCESS_CODE) {
        res.json(config)
    } else {
        res.json({error: "Not Authorized"})
    }
})

router.get("/scouters", (req,res) => {
    if (req.headers.authorization === config.secrets.ACCESS_CODE) {
        res.json(ScoutingSync.getScouters())
    } else {
        res.json({error: "Not Authorized"})
    }
});

router.get("/enterMatch", (req,res) => {
    if (req.headers.authorization === config.secrets.ACCESS_CODE) {
        for (let scouter of ScoutingSync.scouters) {
            if (scouter.state.status == ScoutingSync.SCOUTER_STATUS.WAITING)
                scouter.socket.emit("enterMatch");
        }
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
    if (req.headers.authorization === config.secrets.ACCESS_CODE) {
        res.json({
            "allMatches": await ScoutingSync.getMatches(),
            "currentMatch": ScoutingSync.match
        })
    } else {
        res.json({error: "Not Authorized"})
    }
})
module.exports = router;