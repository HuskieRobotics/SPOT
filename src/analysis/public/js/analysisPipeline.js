const e = require("express");

async function executePipeline() {
  const eventID = getSelectedEvent();

  // Get tmps from database (or cache if offline)

  let tmps;
  let blueAllianceData;
  // If an event is specified, fetch using the new endpoint.
  if (eventID) {
    tmps = await fetch(`/analysis/api/dataset/${eventID}`).then((res) =>
      res.json(),
    );
    blueAllianceData = await fetch(`/analysis/api/blueApiData/${eventID}`).then(
      (res) => res.json(),
    );
  } else {
    tmps = await fetch("/analysis/api/dataset").then((res) => res.json());
    blueAllianceData = await fetch("/analysis/api/blueApiData").then((res) =>
      res.json(),
    );
  }

  tmps.forEach((tmp) => {
    const teamAndAlliance = getBlueDataAllianceAndMatch(
      tmp.robotNumber,
      tmp.matchNumber,
    );

    const isParked = getBlueDataParkAndClimb(
      teamAndAlliance[0],
      teamAndAlliance[1],
    );
    const autoLeave = getBlueDataAutoLeave(
      teamAndAlliance[0],
      teamAndAlliance[1],
    );

    tmp.tbaData = {};
    setPath(tmp.tbaData, "parked", isParked[0]);
    setPath(tmp.tbaData, "deepCage", isParked[1]);
    setPath(tmp.tbaData, "autoLeave", autoLeave);
  });

  /**
   * The purpose of this function is to get the alliance color and the level for which a robot is in tba data for a inputted team and match.
   * @param {*} team The team that you wish to input
   * @param {*} match The match number that you wish to input
   * @returns [robotNum, alliance]
   */
  function getBlueDataAllianceAndMatch(team, match) {
    let alliance;
    let robotNum;

    blueAllianceData.forEach((item) => {
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

    return [robotNum, alliance];
  }

  /**
   * The purpose of this function is to get whether a robot parked in the end game or not and whether a robot is parked in the end game or not.
   * @param {*} robotNum The level of which the robot is in the blue alliance array (Get from getBlueDataTeamAndMatch function)
   * @param {*} alliance The color of alliance the robot was on. (Get from getBlueDataTeamAndMatch function)
   * @returns isParkedAndClimbed
   */
  function getBlueDataParkAndClimb(robotNum, alliance) {
    let isParkedAndClimbed = false;
    blueAllianceData.forEach((item) => {
      let breakdown = item.score_breakdown?.[alliance];
      if (!breakdown) return;

      for (const [key, value] of Object.entries(breakdown)) {
        if (key == `endGameRobot${robotNum}`) {
          if (value == "Parked") {
            isParkedAndClimbed = [true, false];
            break;
          } else if (value == "DeepCage") {
            isParkedAndClimbed = [true, true];
            break;
          } else {
            isParkedAndClimbed = [false, false];
            break;
          }
        }
      }
    });

    // For reference, isParkedAndClimbed[0] is the value for if it is parked, and isParkedAndClimbed[1] is the value for if it has climbed.
    return isParkedAndClimbed;
  }

  /**
   * The purpose of this function is to get whether a robot performed an auto leave or not.
   * @param {*} robotNum
   * @param {*} alliance
   * @returns autoLeave
   */
  function getBlueDataAutoLeave(robotNum, alliance) {
    let autoLeave = false;
    blueAllianceData.forEach((item) => {
      let breakdown = item.score_breakdown?.[alliance];
      if (!breakdown) return;

      for (const [key, value] of Object.entries(breakdown)) {
        if (key == `autoLineRobot${robotNum}`) {
          if (value == "Yes") {
            autoLeave = true;
            break;
          }
        }
      }
    });

    return autoLeave;
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
