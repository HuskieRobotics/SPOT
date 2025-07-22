const { Router } = require("express");
const { TeamMatchPerformance } = require("../../lib/db.js");
//const { executePipeline } = require("../public/js/analysisPipeline.js");
const { setPath } = require("../../lib/util.js");
const axios = require("axios");
const config = require("../../../config/config.json");
const { got } = require("../get.js");

let router = Router();

router.get("/dataset", async (req, res) => {
  res.json(
    await TeamMatchPerformance.find({ eventNumber: config.EVENT_NUMBER })
  );
});

router.delete("/dataset/:id", async (req, res) => {
  const DEMO = config.DEMO;

  if (!DEMO) {
    await TeamMatchPerformance.findByIdAndDelete(req.params.id);
    res.send("Deleted");
  } else {
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
  async function executePipeline() {
    // Get tmps from database (or cache if offline)

    let tmps = await axios
      .get("http://localhost:8080/analysis/api/dataset")
      .then((res) => res.data);

    // Get all tmps stored in the local storage (from qr code)
    const storage = await TeamMatchPerformance.find({
      eventNumber: config.EVENT_NUMBER,
    });
    if (storage) {
      // Parse the QR code TMPs (for some reason the array is stored as a string, and each TMP is ALSO
      // stored as a string, so the array has to be parsed and each individual TMP has to be parsed)
      //const qrcodeTmps = JSON.parse(storage).map((tmp) => JSON.parse(tmp));

      // Merge the TMPs into one
      tmps = [...tmps, ...storage];
    }

    // Find all the teams across the TMPs
    const teams = [];
    for (const tmp of tmps) {
      teams[tmp.robotNumber] = {};
    }

    let dataset = { tmps, teams };

    const manual = await axios
      .get("http://localhost:8080/analysis/api/manual")
      .then((res) => res.data);
    const pipelineConfig = await axios
      .get("http://localhost:8080/config/analysis-pipeline.json")
      .then((res) => res.data);

    // This will show up as a method that doesn't exist since it is gotten from the server
    let getTransformers = await got();
    getTransformers = getTransformers["getTransformers"];
    const transformers = await getTransformers();

    for (let tfConfig of pipelineConfig) {
      dataset = transformers[tfConfig.type][tfConfig.name].execute(
        dataset,
        tfConfig.outputPath,
        tfConfig.options
      );
    }

    dataset.tmps = dataset.tmps.concat(
      manual.tmps.map((tmp) => ({
        ...tmp,
        manual: true,
      }))
    );
    for (const [path, teamData] of Object.entries(manual.teams)) {
      for (const [team, value] of Object.entries(teamData)) {
        if (team in dataset.teams) {
          setPath(dataset.teams[team], "manual." + path, value);
        } else {
          dataset.teams[team] = {};
          setPath(dataset.teams[team], "manual." + path, value);
        }
      }
    }

    return dataset;
  }

  let dataset2 = await executePipeline();

    // Get all tmps stored in the local storage (from qr code)
    const storage = await TeamMatchPerformance.find({
      eventNumber: config.EVENT_NUMBER,
    });
    if (storage) {
      // Parse the QR code TMPs (for some reason the array is stored as a string, and each TMP is ALSO
      // stored as a string, so the array has to be parsed and each individual TMP has to be parsed)
      //const qrcodeTmps = JSON.parse(storage).map((tmp) => JSON.parse(tmp));

      // Merge the TMPs into one
      tmps = [...tmps, ...storage];
    }

    // Find all the teams across the TMPs
    const teams = [];
    for (const tmp of tmps) {
      teams[tmp.robotNumber] = {};
    }

    let dataset = { tmps, teams };

    const manual = await axios
      .get("http://localhost:8080/analysis/api/manual")
      .then((res) => res.data);
    const pipelineConfig = await axios
      .get("http://localhost:8080/config/analysis-pipeline.json")
      .then((res) => res.data);
    //console.log("Pipeline Config : " + pipelineConfig);

    // This will show up as a method that doesn't exist since it is gotten from the server
    let getTransformers = await got();
    getTransformers = getTransformers["getTransformers"];
    console.log(getTransformers);
    const transformers = await getTransformers();

    for (let tfConfig of pipelineConfig) {
      //console.log("tfConfig Type : " + tfConfig.type);
      //console.log("tfConfig Name : " + tfConfig.name);

      dataset = transformers[tfConfig.type][tfConfig.name].execute(
        dataset,
        tfConfig.outputPath,
        tfConfig.options
      );
    }

    dataset.tmps = dataset.tmps.concat(
      manual.tmps.map((tmp) => ({
        ...tmp,
        manual: true,
      }))
    );
    for (const [path, teamData] of Object.entries(manual.teams)) {
      for (const [team, value] of Object.entries(teamData)) {
        if (team in dataset.teams) {
          setPath(dataset.teams[team], "manual." + path, value);
        } else {
          dataset.teams[team] = {};
          setPath(dataset.teams[team], "manual." + path, value);
        }
      }
    }

    return dataset;
  }

  let dataset2 = await executePipeline(); // figure out why this does NOT work
  console.log(dataset2);
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

  // Adding the data which is required for the CSV
  for (let [teamNumber, team] of Object.entries(dataset2.teams).filter(
    ([num, team]) => checkData(team)
  )) {
    if (headerRow) {
      headerRow = false;
      rows.push([
        "Team #",
        ...Object.entries(team.avgTotalPoints ?? {})
          .filter(([key, value]) => !isNaN(value) && value)
          .map(([i, x]) => i + " Average"),
        ...Object.entries(team.avgTotalPoints ?? {})
          .filter(([key, value]) => !isNaN(value))
          .map(([i, x]) => i + " Score Average"),
        "Average Coral Cycle Time",
        "Average Algae Cycle Time",
        "Average Time to Climb",
        "Average Auto Points",
        "Average Teleop Points",
        "Coral Accuracy",
        "Algae Accuracy",
        "Average Coral Points",
        "Average Algae Points",
        "Average Total Points",
        "Average Coral Miss",
        "Average Algae Miss",
        "Lv 1 Coral",
        "Lv 2 Coral",
        "Lv 3 Coral",
        "Lv 4 Coral",
        "Ground Pickup Algae",
        "Reef Pickup Algae",
        "Ground Pickup Coral",
        "Station Pickup Coral",
        "Algae Score Net",
        "Algae Score Processor",
      ]);
    }

    const avgTotalPoints = Object.entries(team.avgTotalPoints ?? {})
      .filter(([key, value]) => !isNaN(value) && value)
      .map(([i, x]) => x);

    rows.push([
      teamNumber,
      ...avgTotalPoints,
      ...avgTotalPoints,
      (team.cycleCoral?.averageTime ?? 0 / 1000).toFixed(2) + "s",
      (team.cycleAlgae?.averageTime ?? 0 / 1000).toFixed(2) + "s",
      (team.bargeCycle?.averageTimeComplete ?? 0 / 1000).toFixed(2) + "s",
      team.avgAutoPoints?.toFixed(2) ?? "0.00",
      team.avgTeleopPoints?.toFixed(2) ?? "0.00",
      (team.coralAccuracy * 100)?.toFixed(2) + "%" ?? "0.00%",
      (team.algaeAccuracy * 100)?.toFixed(2) + "%" ?? "0.00%",
      team.avgCoralPoints?.toFixed(2) ?? "0.00",
      team.avgAlgaePoints?.toFixed(2) ?? "0.00",
      team.avgTotalPoints?.toFixed(2) ?? "0.00",
      team.avgAlgaeMiss?.toFixed(2) ?? "0.00",
      team.avgTotalMiss?.toFixed(2) ?? "0.00",
      team.counts?.teleopl1 + (team.autol1 || 0) === 0 ? "No" : "Yes",
      team.counts?.teleopl2 + (team.autol2 || 0) === 0 ? "No" : "Yes",
      team.counts?.teleopl3 + (team.autol3 || 0) === 0 ? "No" : "Yes",
      team.counts?.teleopl4 + (team.autol4 || 0) === 0 ? "No" : "Yes",
      team.counts?.groundPickupAlgae === 0 ? "No" : "Yes",
      team.counts?.reefPickupAlgae === 0 ? "No" : "Yes",
      team.counts?.groundPickupCoral === 0 ? "No" : "Yes",
      team.counts?.stationPickupCoral === 0 ? "No" : "Yes",
      team.counts?.teleopScoreNet + team.counts?.autoScoreNet === 0
        ? "No"
        : "Yes",
      team.counts?.teleopScoreProcessor + team.counts?.autoScoreProcessor === 0
        ? "No"
        : "Yes",
    ]);
  }

  //make into csv
  let csv = rows
    .map((row) => row.reduce((acc, value) => acc + `,${value}`))
    .reduce((acc, row) => acc + `${row}\n`, "");
  res.set({ "Content-Disposition": `attachment; filename="teams.csv"` });
  res.send(csv);
});

module.exports = router;
