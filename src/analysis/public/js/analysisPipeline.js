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

  tmps.forEach((tmp) => {
    const teamAndAlliance = getTBADataAllianceAndMatch(
      tmp.robotNumber,
      tmp.matchNumber,
    );

    const autoData = getTBADataAutoOrEnd(
      teamAndAlliance.robotNum,
      teamAndAlliance.alliance,
      tmp.matchNumber,
      "auto",
    );
    const endGameData = getTBADataAutoOrEnd(
      teamAndAlliance.robotNum,
      teamAndAlliance.alliance,
      tmp.matchNumber,
      "endGame",
    );

    if (autoData) {
      tmp.actionQueue.push({
        id: `${autoData.actionName}` + "_" + `${autoData.action}`,
        ts: 0,
      });
    }

    if (endGameData) {
      tmp.actionQueue.push({
        id: `${endGameData.actionName}` + "_" + `${endGameData.action}`,
        ts: 0,
      });
    }
  });

  /**
   * The purpose of this function is to get the alliance color and the level for which a robot is in tba data for a inputted team and match.
   * @param {String} team The team that you wish to input
   * @param {Number} match The match number that you wish to input
   * @returns robotNum, alliance
   */
  function getTBADataAllianceAndMatch(team, match) {
    let robotNum = "";
    let alliance = "";

    /**
     * Explanation of how this robotNum is gotten: Basically, the way that TBA data is formatted is so that
     *  we have teams like 3061, 111, 112 and then something like autoRobot1, autoRobot2, autoRobot3.
     * 3061 is the same as autoRobot1
     * 111 is the same as autoRobot2
     * 112 is the same as autoRobot3
     *
     * The code just gets what level the team is (e.x., 3061 : 1, 111: 2, 112: 3) by way of simple iteration.
     */

    tbaData.forEach((item) => {
      if (item.comp_level == "qm" && item.match_number == match) {
        let i = 0;
        // Get what alliance the robot was on and what level in the array it is.
        for (const blueTeam of item.alliances.blue.team_keys) {
          i++;
          if (blueTeam.substring(3) == team) {
            alliance = "blue";
            robotNum = i;
          }
        }
        i = 0;
        for (const redTeam of item.alliances.red.team_keys) {
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
   * The purpose of this function is to get what action the specified robot performed in auto or endgame (depending on specified parameter).
   * @param {Number} robotNum The level of which the robot is in the blue alliance array (Get from getBlueDataTeamAndMatch function)
   * @param {String} alliance The color of alliance the robot was on. (Get from getBlueDataTeamAndMatch function)
   * @param {Number} match The match number that the tmp has
   * @param {String} typeString The string with the type of data you wish to get
   * @returns actionName, action
   */
  function getTBADataAutoOrEnd(robotNum, alliance, match, typeString) {
    let actionName = "";
    let action = "";

    // Go through each match in TBA data
    for (const item of tbaData) {
      // Check if the competition level is a qualification match and if the match number aligns
      if (item.comp_level == "qm" && item.match_number == match) {
        // Get the alliance scores for the inputted color
        const breakdown = item.score_breakdown?.[alliance];
        if (!breakdown) return;

        // Go through each item in the breakdown
        for (const [key, value] of Object.entries(breakdown)) {
          // Check if it is the desired type and the desired robot
          if (key.startsWith(`${typeString}`) && key.endsWith(`${robotNum}`)) {
            actionName = key.substring(0, key.length - 1);
            action = value;
            return { actionName, action };
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
  console.log(dataset);
  return dataset;
}
if (typeof module !== "undefined") module.exports = { executePipeline };
