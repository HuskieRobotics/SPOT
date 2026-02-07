const express = require("express");
const path = require("path");
let router = express.Router();
const { getPublicConfig } = require("./lib/config");

router.get("/config.json", (req, res) => {
  // Send config without secrets (using getPublicConfig helper)
  res.json(getPublicConfig());
});

router.get("/match-scouting.json", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../config/match-scouting.json"));
});

router.get("/qr.json", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../config/qr.json"));
});

router.get("/analysis-modules.json", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../config/analysis-modules.json"));
});

router.get("/analysis-pipeline.json", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../config/analysis-pipeline.json"));
});

module.exports = router;
