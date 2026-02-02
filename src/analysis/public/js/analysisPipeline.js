const e = require("express");

async function executePipeline() {
  const eventID = getSelectedEvent();
  // Get tmps from database (or cache if offline)

  let tmps;
  let tbaData;
  // If an event is specified, fetch using the new endpoint.
  if (eventID) {
    tmps = await fetch(`/analysis/api/dataset/${eventID}`).then((res) =>
      res.json(),
    );
    tbaData = await fetch(`/analysis/api/blueApiData/${eventID}`).then((res) =>
      res.json(),
    );
  } else {
    tmps = await fetch("/analysis/api/dataset").then((res) => res.json());
    tbaData = await fetch("/analysis/api/blueApiData").then((res) =>
      res.json(),
    );
  }

  console.log(tbaData);

  tmps.forEach((tmp) => {
    const teamAndAlliance = getTBADataAllianceAndMatch(
      tmp.robotNumber,
      tmp.matchNumber,
    );

    const autoData = getTBADataAuto(
      teamAndAlliance.robotNum,
      teamAndAlliance.alliance,
      tmp.matchNumber,
    );
    const endGameData = getTBADataEndGame(
      teamAndAlliance.robotNum,
      teamAndAlliance.alliance,
      tmp.matchNumber,
    );

    tmp.tbaData = {};
    if (autoData) {
      setPath(tmp.tbaData, `${autoData.autoActionName}`, autoData.autoAction);
    }
    if (endGameData) {
      setPath(
        tmp.tbaData,
        `${endGameData.endGameActionName}`,
        endGameData.endGameAction,
      );
    }
  });

  /**
   * The purpose of this function is to get the alliance color and the level for which a robot is in tba data for a inputted team and match.
   * @param {*} team The team that you wish to input
   * @param {*} match The match number that you wish to input
   * @returns robotNum, alliance
   */
  function getTBADataAllianceAndMatch(team, match) {
    let robotNum = "";
    let alliance = "";

    tbaData.forEach((item) => {
      if (item.comp_level == "qm" && item.match_number == match) {
        let i = 0;
        // Get what alliance the robot was on and what level in the array it is.
        for (let blueTeam of item.alliances.blue.team_keys) {
          i++;
          if (blueTeam.substring(3) == team) {
            alliance = "blue";
            robotNum = i;
          }
        }
        i = 0;
        for (let redTeam of item.alliances.red.team_keys) {
          i++;
          if (redTeam.substring(3) == team) {
            alliance = "red";
            robotNum = i;
          }
        }
      }
    });

    return { robotNum, alliance };
  }

  /**
   * The purpose of this function is to get what action the specified robot performed in auto.
   * @param {*} robotNum The level of which the robot is in the blue alliance array (Get from getBlueDataTeamAndMatch function)
   * @param {*} alliance The color of alliance the robot was on. (Get from getBlueDataTeamAndMatch function)
   * @param {*} match The match number that the tmp has
   * @returns autoActionName, autoAction
   */
  function getTBADataAuto(robotNum, alliance, match) {
    let autoActionName = "";
    let autoAction = "";

    for (let item of tbaData) {
      if (item.comp_level == "qm" && item.match_number == match) {
        let breakdown = item.score_breakdown?.[alliance];
        if (!breakdown) return;

        for (const [key, value] of Object.entries(breakdown)) {
          if (key.startsWith("auto") && key.endsWith(`${robotNum}`)) {
            autoActionName = key.substring(0, key.length - 1);
            autoAction = value;
            return { autoActionName, autoAction };
          }
        }
      }
    }
  }

  /**
   * The purpose of this function is to get the action that was performed by the specified robot in the endgame of the match.
   * @param {*} robotNum The level of which the robot is in the blue alliance array (Get from getBlueDataTeamAndMatch function)
   * @param {*} alliance The color of alliance the robot was on. (Get from getBlueDataTeamAndMatch function)
   * @param {*} match The match number that the tmp has
   * @returns endGameActionName, endGameAction
   */
  function getTBADataEndGame(robotNum, alliance, match) {
    let endGameActionName = "";
    let endGameAction = "";

    for (let item of tbaData) {
      if (item.comp_level == "qm" && item.match_number == match) {
        let breakdown = item.score_breakdown?.[alliance];
        if (!breakdown) return;

        for (const [key, value] of Object.entries(breakdown)) {
          if (key.startsWith("endGame") && key.endsWith(`${robotNum}`)) {
            endGameActionName = key.substring(0, key.length - 1);
            endGameAction = value;
            return { endGameActionName, endGameAction };
          }
        }
      }
    }
  }

  // Get all tmps stored in the local storage (from qr code)
  const storage = localStorage.getItem("teamMatchPerformances");
  if (storage) {
    // Parse the QR code TMPs (for some reason the array is stored as a string, and each TMP is ALSO
    // stored as a string, so the array has to be parsed and each individual TMP has to be parsed)
    const qrcodeTmps = JSON.parse(storage).map((tmp) => JSON.parse(tmp));

    // Merge the TMPs into one
    tmps = [...tmps, ...qrcodeTmps];
  }

  // Find all the teams across the TMPs
  const teams = [];
  for (const tmp of tmps) {
    teams[tmp.robotNumber] = {};
  }

  console.log(tmps);
  console.log(teams);

  let dataset = { tmps, teams };

  // FIXME: figure out what the manual endpoint is for (and its associated json files)
  const manual = await fetch("./api/manual").then((res) => res.json());
  const pipelineConfig = await fetch(
    "../../../config/analysis-pipeline.json",
  ).then((res) => res.json());

  // This will show up as a method that doesn't exist since it is gotten from the server
  const transformers = await getTransformers();

  for (let tfConfig of pipelineConfig) {
    dataset = transformers[tfConfig.type][tfConfig.name].execute(
      dataset,
      tfConfig.outputPath,
      tfConfig.options,
    );
  }

  dataset.tmps = dataset.tmps.concat(
    manual.tmps.map((tmp) => ({
      ...tmp,
      manual: true,
    })),
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
if (typeof module !== "undefined") module.exports = { executePipeline };
