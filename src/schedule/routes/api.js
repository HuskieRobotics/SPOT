const { Router } = require("express");
let router = Router();
const config = require("../../../config/config.json");
const { TeamMatchPerformance } = require("../../lib/db");

var schedule = [];
var tempTeams = [];

router.get("/auth", (req, res) => {
  if (config.secrets.ACCESS_CODE === "") {
    res.json({ status: 2 });
  } else if (config.secrets.ACCESS_CODE == req.headers.authorization) {
    res.json({ status: 1 });
  } else {
    res.json({ status: 0 });
  }
});

router.post("/matches", (req, res) => {
  schedule = req.body;
  addTeam(req.body);

  res.sendStatus(200);
});

router.get("/matches", (req, res) => {
  res.json(schedule);
});

router.get("/tempTeams", (req, res) => {
  res.json(tempTeams);
});

const addTeam = (matchLists) => {
  var teams = [];

  for (let i = 0; i < matchLists.length; i++) {
    const element = matchLists[i];

    element.robots.blue.forEach((teamNumber) => {
      if (!teams.includes(teamNumber)) {
        teams.push({ team_number: teamNumber, nickname: "temp team" });
      }
    });

    element.robots.red.forEach((teamNumber) => {
      if (!teams.includes(teamNumber)) {
        teams.push({ team_number: teamNumber, nickname: "temp team" });
      }
    });
  }

  tempTeams = teams;
};

module.exports = router;
