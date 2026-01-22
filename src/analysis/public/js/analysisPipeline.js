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

  for (let tmp of tmps) {
    let teamAndMatch = getBlueDataTeamAndMatch(
      tmp.robotNumber,
      tmp.matchNumber,
    );
  }

  /**
   * The purpose of this function is to get the alliance color and the level for which a robot is in tba data for a inputted team and match.
   * @param {*} team The team that you wish to get
   * @param {*} match The match number that you wish to get
   * @returns [alliance, robotNum]
   */
  function getBlueDataTeamAndMatch(team, match) {
    let alliance;
    let robotNum;

    console.log(team, match);

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
   * The purpose of this function is to get whether a robot parked in the end game or not.
   * @param {*} robotNum The level of which the robot is in the blue alliance array (Get from getBlueDataTeamAndMatch function)
   * @param {*} alliance The color of alliance the robot was on. (Get from getBlueDataTeamAndMatch function)
   * @returns isParked
   */
  function getBlueDataParked(robotNum, alliance) {
    let isParked = false;

    blueAllianceData.forEach((item) => {
      const breakdown = item.score_breakdown?.[alliance];
      if (!breakdown) return;
      let robotParked;

      for (const data of breakdown) {
        let robot = `endGameRobot${robotNum}`;
        robotParked = data?.[robot];
      }

      if (robotParked == "Parked") {
        isParked = true;
      }
    });

    return isParked;
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

  //console.log(blueAllianceData);

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
