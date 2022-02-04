const express = require("express");
const path = require("path");
let router = express.Router();
const config = require("../config/config.json")

router.get("/config.json", (req,res) => {
    const configClone = {...config}
    delete configClone.secrets //dont send secrets to client
    res.json(configClone);
})

router.get("/match-scouting.json", (req,res) => {
    res.sendFile(path.resolve(__dirname, "../config/match-scouting.json"));
})

router.get("/qr.json", (req,res) => {
    res.sendFile(path.resolve(__dirname, "../config/qr.json"));
})

router.get("/analysis-modules.json", (req,res) => {
    res.sendFile(path.resolve(__dirname, "../config/analysis-modules.json"));
})

module.exports = router;