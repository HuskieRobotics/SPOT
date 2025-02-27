const { Router } = require("express");
const { writeFileSync, readdirSync, rmSync } = require("fs");
const path = require("path");
const config = require("../../../config/config.json");
let router = Router();

// Authentication middleware
router.use((req, res, next) => {
  if (`${req.headers.cookie}`.includes(`auth=${config.secrets.ACCESS_CODE}`)) {
    next();
  } else if (config.secrets.ACCESS_CODE == req.headers.authorization) {
    res.cookie("auth", config.secrets.ACCESS_CODE);
    next();
  } else res.status(401).send("Unauthorized!").end();
});

router.post("/config", function (req, res) {
  try {
    writeFileSync("config/match-scouting.json", JSON.stringify(req.body, null, 2));
    res.send("Success").end();
  } catch (e) {
    console.error("Cannot apply configuration from editor", e);
    res.status(500).send("Failed").end();
  }
});

router.get("/config", function (req, res) {
  res.sendFile(path.resolve(require.main.path, "..", "config/match-scouting.json"));
});

router.get("/exe/css", function (req, res) {
  res.sendFile(path.resolve(require.main.path, "scouting/public/css/buttons.css"));
});

router.post("/exe/css", function (req, res) {
  try {
    writeFileSync(path.resolve(require.main.path, "scouting/public/css/buttons.css"), req.body.v);
    res.send("Success").end();
  } catch (e) {
    console.error("Cannot apply configuration from editor", e);
    res.status(500).send("Failed").end();
  }
});

router.get("/exe", function (req, res) {
  res.send(readdirSync(path.resolve(require.main.path, "scouting/executables")));
});

router.get("/exe/:name", function (req, res) {
  res.sendFile(path.resolve(require.main.path, "scouting/executables", req.params.name));
});

router.post("/exe/:name", function (req, res) {
  try {
    writeFileSync(path.resolve(require.main.path, "scouting/executables", req.params.name), req.body.v);
    res.send("Success").end();
  } catch (e) {
    console.error("Cannot apply configuration from editor", e);
    res.status(500).send("Failed").end();
  }
});

router.delete("/exe/:name", function (req, res) {
  try {
    rmSync(path.resolve(require.main.path, "scouting/executables", req.params.name));
    res.send("Success").end();
  } catch (e) {
    console.error("Cannot apply configuration from editor", e);
    res.status(500).send("Failed").end();
  }
});

router.get("/auth", function (req, res) {
  res.status(200).send("OK").end();
});

module.exports = router;