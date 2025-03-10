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

  // WHAT IS EVEN GOING ON DOWN HERE????
  for (let [teamNumber, team] of Object.entries(dataset2.teams).filter(
    ([num, team]) => checkData(team)
  )) {
    if (headerRow) {
      headerRow = false;
      rows.push([
        "Team #",
        ...Object.entries(team.avgTotalPoints)
          .filter(([key, value]) => !isNaN(value) && value)
          .map(([i, x]) => i + " Average"), //all averages
        ...Object.entries(team.avgTotalPoints)
          .filter((item) => !isNaN(item))
          .map(([i, x]) => i + " Score Average"), //all averages
        "Average Cycle",
        "Average Completed Cycle",
      ]);
    }
    rows.push([
      teamNumber,
      ...Object.entries(team.avgTotalPoints)
        .filter(([key, value]) => !isNaN(value) && value)
        .map(([i, x]) => x), //all averages
      ...Object.entries(team.avgTotalPoints)
        .filter((item) => !isNaN(item))
        .map(([i, x]) => x), //all averages
      team.cycleAlgae.avgTime,
      team.cycleAlgae.avgTimeComplete,
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
