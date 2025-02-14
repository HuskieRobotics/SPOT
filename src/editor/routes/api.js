const { Router } = require("express");
const { writeFileSync, readdirSync, rmSync } = require("fs");
const path = require("path");
let router = Router();

router.post("/config", function(req, res) {
  try {
    writeFileSync("config/match-scouting.json", JSON.stringify(req.body, null, 2));
    res.send("Success").end();
  } catch(e) {
    console.error("Cannot apply configuration from editor", e);
    res.status(500).send("Failed").end();
  }
});

router.get("/config", function(req, res) {
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

router.get("/exe", function(req, res) {
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

module.exports = router;