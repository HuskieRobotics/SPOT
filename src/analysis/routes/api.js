const { Router } = require("express");
const { TeamMatchPerformance } = require("../../lib/db.js");
const axios = require("axios");
const config = require("../../../config/config.json");

let router = Router();

router.get("/dataset", async (req, res) => {
  res.json(
    await TeamMatchPerformance.find({
      eventNumber: config.EVENT_NUMBER,
    })
  );
});

router.get("/dataset/:eventNumber", async (req, res) => {
  res.json(
    await TeamMatchPerformance.find({ eventNumber: req.params.eventNumber })
  );
});

router.delete("/dataset/:id", async (req, res) => {
  const DEMO = config.DEMO;

  if (!DEMO) {
    if (req.headers.authorization === config.secrets.ACCESS_CODE) {
      await TeamMatchPerformance.findByIdAndDelete(req.params.id);
      res.send("Deleted");
    } else {
      return res.send("Invalid Access Code");
    }
    return res.send("DEMO mode is enabled, cannot delete");
  }
});

if (!config.secrets.TBA_API_KEY) {
  console.error(
    chalk.whiteBright.bgRed.bold(
      "TBA_API_KEY not found in config.json file! SPOT will not properly function without this."
    )
  );
}

router.get("/teams", async (req, res) => {
  if (!config.secrets.TBA_API_KEY) {
    return res.json([]); //no key, no teams
  }
  let teams = [];

  teams = (await axios.get("/schedule/api/tempTeams")).data;

  if (teams.length === 0) {
    teams = (
      await axios
        .get(
          `https://www.thebluealliance.com/api/v3/event/${config.TBA_EVENT_KEY}/teams`,
          {
            headers: {
              "X-TBA-Auth-Key": config.secrets.TBA_API_KEY,
            },
          }
        )
        .catch((e) =>
          console.error(
            e,
            chalk.bold.red("\nError fetching teams from Blue Alliance API!")
          )
        )
    ).data;
  }
  res.json(teams);
});

router.get("/manual", async (req, res) => {
  const manual = {
    teams: require("../manual/teams.json"),
    tmps: require("../manual/tmps.json"),
  };

  res.json(manual);
});

router.get("/csv", async (req, res) => {
  let dataset = await execute();

  //create rows
  let rows = [];
  let headerRow = true;
  let checkData = function (team) {
    if (
      Object.entries(team).filter(([key, value]) => key != "manual").length == 0
    ) {
      return false;
    }
    return true;
  };

  for (let [teamNumber, team] of Object.entries(dataset.teams).filter(
    ([num, team]) => checkData(team)
  )) {
    if (headerRow) {
      headerRow = false;
      rows.push([
        "Team #",
        ...Object.entries(team.averages)
          .filter(([key, value]) => !isNaN(value) && value)
          .map(([i, x]) => i + " Average"), //all averages
        ...Object.entries(team.averageScores)
          .filter((item) => !isNaN(item))
          .map(([i, x]) => i + " Score Average"), //all averages
        "Average Cycle",
        "Average Completed Cycle",
      ]);
    }
    rows.push([
      teamNumber,
      ...Object.entries(team.averages)
        .filter(([key, value]) => !isNaN(value) && value)
        .map(([i, x]) => x), //all averages
      ...Object.entries(team.averageScores)
        .filter((item) => !isNaN(item))
        .map(([i, x]) => x), //all averages
      team.cycle.averageTime,
      team.cycle.averageTimeComplete,
    ]);
  }

  //make into csv
  let csv = rows
    .map((row) => row.reduce((acc, value) => acc + `,${value}`))
    .reduce((acc, row) => acc + `${row}\n`, "");
  res.set({ "Content-Disposition": `attachment; filename="teams.csv"` });
  res.send(csv);
});

router.get("/dataset/:eventNumber", async (req, res) => {
  const eventNumber = req.params.eventNumber; // Grab the selected event number

  if (!eventNumber) {
    return res.status(400).send("Event number is required");
  }

  try {
    // Use the eventNumber instead of the one in config to fetch event data.
    const eventData = await TeamMatchPerformance.find({
      eventNumber: parseInt(eventNumber, 10),
    });

    // Render the index page and pass eventData and eventNumber to the client
    res.render(__dirname + "/views/index.ejs", {
      eventNumber,
      eventData: JSON.stringify(eventData),
    });
  } catch (error) {
    console.error("Error fetching event data:", error);
    res.status(500).send("Failed to fetch event data");
  }
});

router.get("/allDataset", async (req, res) => {
  try {
    // Return all entries without filtering by eventNumber
    const results = await TeamMatchPerformance.find({});
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
