//load the service worker, allows for offline analysis
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").then(
      function (registration) {
        console.log(
          "ServiceWorker registration successful with scope: ",
          registration.scope
        );
      },
      function (err) {
        console.log("ServiceWorker registration failed: ", err);
      }
    );
  });
}

(async () => {
  //modules object structure
  const modules = {
    team: [],
    match: {
      left: [],
      right: [],
      both: [],
    },
  };

  //start loading animation, fetch modules config, fetch dataset, then initialize UI elements
  let dataset;
  let matches;
  await loadAround(async () => {
    const modulesConfig = await fetch(`/config/analysis-modules.json`).then(
      (res) => res.json()
    );
    dataset = await executePipeline();
    matches = (await fetch("/admin/api/matches").then((res) => res.json()))
      .allMatches;

    initDashboard(dataset, modulesConfig);
    await new Promise((r) => setTimeout(r, 300));
  });
  showFade(app);

  //data fetchers
  async function fetchDataset() {
    return await fetch("./api/dataset").then((res) => res.json());
  }

  async function fetchTeams() {
    const teams = await fetch(`/analysis/api/teams`).then((res) => res.json());
    return teams.reduce((acc, t) => {
      acc[t.team_number] = t.nickname;
      return acc;
    }, {});
  }

  //team UI functions
  async function loadTeams(dataset, modulesConfig) {
    const allTeams = await fetchTeams();
    for (const [teamNumber, team] of Object.entries(dataset.teams)) {
      if (allTeams[teamNumber]) {
        const teamContainer = constructTeam(teamNumber, team, allTeams);
        teamList.appendChild(teamContainer);
      }
    }
    if (modulesConfig.map((m) => m.position).includes("side")) {
      teamView.classList.add("side-enabled");
    } else {
      teamView.classList.remove("side-enabled");
    }
    for (const module of modulesConfig.filter((m) => m.view == "team")) {
      const moduleObject = new moduleClasses[module.module](module);
      if (module.position == "main") {
        mainList.appendChild(moduleObject.container);
      } else {
        sideList.appendChild(moduleObject.container);
      }
      modules.team.push(moduleObject);
    }
  }

  function constructTeam(teamNumber, team, allTeams) {
    const teamContainer = createDOMElement("div", "team-container");
    const teamNumDisplay = createDOMElement("div", "team-number");
    teamNumDisplay.innerText = teamNumber;
    teamContainer.setAttribute("num", teamNumber);
    teamContainer.appendChild(teamNumDisplay);
    if (allTeams) {
      const teamNameDisplay = createDOMElement("div", "team-name");
      teamNameDisplay.innerText = allTeams[teamNumber];
      teamContainer.appendChild(teamNameDisplay);
    }
    teamContainer.addEventListener("click", async () => {
      await setTeamModules(teamNumber);
      displayTeam(teamContainer);
    });
    return teamContainer;
  }

  async function loadTeamsAutoPick(dataset, modulesConfig) {
    autoPickTeamList.innerHTML = "";
    const allTeams = await fetchTeams();
    var teams = [];
    for (var [teamNumber, team] of Object.entries(dataset.teams)) {
      if (
        dataset.tmps.filter((tmp) => tmp.robotNumber == teamNumber).length > 0 &&
        allTeams[teamNumber]
      ) {
        setPath(team, "robotNumber", teamNumber);
        teams.push(team);
      }
    }
    compareAllTeams(teams);
    let teamsProbability = teams.map((team) => {
      return {
        robotNumber: team.robotNumber,
        avgProbability: team.avgProbability,
      };
    });
    for (let i = 0; i < teams.length; i++) {
      for (let j = 0; j < teamsProbability.length; j++) {
        if (teams[i].robotNumber == teamsProbability[j].robotNumber) {
          setPath(
            teams[i],
            "avgProbability",
            getPath(teamsProbability[j], "avgProbability", 0)
          );
        }
      }
    }
    let sorted = false;
    while (!sorted) {
      sorted = true;
      for (let i = 0; i < teams.length - 1; i++) {
        if (
          teams[i].avgProbability < teams[i + 1].avgProbability &&
          teams[i].avgProbability != undefined &&
          teams[i + 1].avgProbability != undefined
        ) {
          let temp = teams[i];
          teams[i] = teams[i + 1];
          teams[i + 1] = temp;
          sorted = false;
        }
      }
    }
    const firstContainer = constructTeamAutoPick(
      teams[0].robotNumber,
      teams[0],
      allTeams
    );
    autoPickTeamList.appendChild(firstContainer);
    firstContainer.click();
    for (let i = 1; i < teams.length; i++) {
      const autoPickTeamContainer = constructTeamAutoPick(
        teams[i].robotNumber,
        teams[i],
        allTeams
      );
      autoPickTeamList.appendChild(autoPickTeamContainer);
    }
    autoPickStats.innerHTML = "";
    autoPickMain.innerHTML = "";
    for (const module of modulesConfig.filter((m) => m.view == "team")) {
      const moduleObject = new moduleClasses[module.module](module);
      if (module.position == "side") {
        autoPickStats.appendChild(moduleObject.container);
      } else if (module.position == "main") {
        autoPickMain.appendChild(moduleObject.container);
      }
      modules.team.push(moduleObject);
    }
    setTimeout(() => {
      firstContainer.click();
    }, 4);
  }

  function constructTeamAutoPick(teamNumber, team, allTeams) {
    const teamContainer = createDOMElement("div", "team-container");
    const teamNumDisplay = createDOMElement("div", "team-number");
    teamNumDisplay.innerText = teamNumber;
    teamContainer.setAttribute("num", teamNumber);
    teamContainer.appendChild(teamNumDisplay);
    if (allTeams) {
      const teamNameDisplay = createDOMElement("div", "team-name");
      teamNameDisplay.innerText = allTeams[teamNumber];
      teamContainer.appendChild(teamNameDisplay);
    }
    teamContainer.addEventListener("click", async () => {
      await setTeamModules(teamNumber);
      displayStats(teamContainer);
    });
    return teamContainer;
  }

  function displayTeam(teamContainer) {
    clearInterface();
    teamContainer.classList.add("selected");
    showFade(teamView);
  }

  function displayStats(teamContainer) {
    Array.from(document.querySelector("#auto-pick-team-list").children).map(
      (t) => t.classList.remove("selected")
    );
    teamContainer.classList.add("selected");
    autoPickStats.style.display = "block";
    autoPickMain.style.display = "flex";
  }

  async function setTeamModules(teamNumber) {
    for (const module of modules.team) {
      if (
        !module.moduleConfig.separate &&
        Object.keys(dataset.teams[teamNumber]).filter(
          (prop) => prop !== "manual"
        ).length == 0
      ) {
        if (module.moduleConfig.position == "side") {
          await module.setData(await module.formatData([teamNumber], dataset));
        }
        module.container.classList.add("hidden");
      } else {
        module.container.classList.remove("hidden");
        await module.setData(await module.formatData([teamNumber], dataset));
      }
    }
    autoPickStats.style.display = "none";
    autoPickMain.style.display = "none";
  }

  async function loadMatchView(dataset, modulesConfig) {
    matchViewSwitch.addEventListener("click", () => {
      clearInterface();
      matchViewSwitch.classList.add("selected");
      bubbleSheetSwitch.classList.remove("selected");
      showFade(matchView);
    });

    const matchSelect = document.querySelector("#match-select");
    for (const match of matches) {
      const option = createDOMElement("option");
      option.innerText = match.match_string.split("_")[1].toUpperCase();
      option.value = match.match_string;
      matchSelect.appendChild(option);
    }

    const teamSelects = Array.from(
      document.querySelectorAll(".alliance-selects")
    )
      .map((g) => Array.from(g.children))
      .flat();
    const allTeams = await fetchTeams();
    for (const teamSelect of teamSelects) {
      for (const team of Object.keys(dataset.teams)) {
        const option = createDOMElement("option");
        option.innerText = team;
        option.value = team;
        teamSelect.appendChild(option);
      }
      teamSelect.addEventListener("change", async () => {
        matchSelect.value = "none";
        matchSelect.classList.remove("filled");
        if (teamSelect.value === "none") {
          teamSelect.classList.remove("filled");
        } else {
          teamSelect.classList.add("filled");
        }
        if (
          teamSelects
            .map((s) => s.value)
            .slice(0, 3)
            .every((v) => v === "none")
        ) {
          leftAllianceModules.classList.add("hidden");
        } else {
          leftAllianceModules.classList.remove("hidden");
        }
        if (
          teamSelects
            .map((s) => s.value)
            .slice(3)
            .every((v) => v === "none")
        ) {
          rightAllianceModules.classList.add("hidden");
        } else {
          rightAllianceModules.classList.remove("hidden");
        }
        await setMatchModules([
          teamSelects
            .slice(0, 3)
            .map((s) => s.value)
            .filter((s) => s !== "none"),
          teamSelects
            .slice(3)
            .map((s) => s.value)
            .filter((s) => s !== "none"),
        ]);
      });
    }

    matchSelect.addEventListener("change", async () => {
      if (matchSelect.value !== "none") {
        matchSelect.classList.add("filled");
        const selectedMatch = matches.find(
          (m) => m.match_string == matchSelect.value
        );
        for (let i = 0; i < 3; i++) {
          teamSelects[i].value = Object.keys(dataset.teams).includes(
            selectedMatch.robots.red[i]
          )
            ? selectedMatch.robots.red[i]
            : "none";
          if (teamSelects[i].value === "none") {
            teamSelects[i].classList.remove("filled");
          } else {
            teamSelects[i].classList.add("filled");
          }
          teamSelects[i + 3].value = Object.keys(dataset.teams).includes(
            selectedMatch.robots.blue[i]
          )
            ? selectedMatch.robots.blue[i]
            : "none";
          if (teamSelects[i + 3].value === "none") {
            teamSelects[i + 3].classList.remove("filled");
          } else {
            teamSelects[i + 3].classList.add("filled");
          }
        }
        if (
          teamSelects
            .map((s) => s.value)
            .slice(0, 3)
            .every((v) => v === "none")
        ) {
          leftAllianceModules.classList.add("hidden");
        } else {
          leftAllianceModules.classList.remove("hidden");
        }
        if (
          teamSelects
            .map((s) => s.value)
            .slice(3)
            .every((v) => v === "none")
        ) {
          rightAllianceModules.classList.add("hidden");
        } else {
          rightAllianceModules.classList.remove("hidden");
        }
        await setMatchModules([
          teamSelects
            .slice(0, 3)
            .map((s) => s.value)
            .filter((s) => s !== "none"),
          teamSelects
            .slice(3)
            .map((s) => s.value)
            .filter((s) => s !== "none"),
        ]);
      } else {
        matchSelect.classList.remove("filled");
      }
    });

    for (const module of modulesConfig.filter((m) => m.view == "match")) {
      const leftModuleObject = new moduleClasses[module.module](module);
      leftAllianceModules.appendChild(leftModuleObject.container);
      modules.match.left.push(leftModuleObject);

      const rightModuleObject = new moduleClasses[module.module](module);
      rightAllianceModules.appendChild(rightModuleObject.container);
      modules.match.right.push(rightModuleObject);
    }
  }

  async function loadAutoPickList(dataset, modulesConfig) {
    autoPickSwitch.addEventListener("click", () => {
      clearInterface();
      autoPickSwitch.classList.add("selected");
      bubbleSheetSwitch.classList.remove("selected");
      loadTeamsAutoPick(dataset, modulesConfig);
      showFade(autoPickView);
    });
  }

  async function loadBubbleGraph(dataset, modulesConfig) {
    bubbleSheetSwitch.addEventListener("click", () => {
      clearInterface();
      bubbleSheetSwitch.classList.add("selected");
      bubbleGraphContainer.style.display = "block";
      showFade(bubbleSheetView);
    });
    const bubbleSheetContainer = document.getElementById("bubble-sheet-graph");

    const teams = Object.keys(dataset.teams);
    const autoScores = teams.map((team) =>
      getPath(dataset.teams[team], "avgAutoPoints", 0).toFixed(2)
    );

    const teleopScores = teams.map((team) =>
      getPath(dataset.teams[team], "avgTeleopPoints", 0).toFixed(2)
    );

    const stageScores = teams.map((team) =>
      getPath(dataset.teams[team], "avgStagePoints", 0).toFixed(2)
    );

    const totalScores = teams.map((team) =>
      getPath(dataset.teams[team], "avgTotalPoints", 0).toFixed(2)
    );

    const avgAutoScore = (
      autoScores.reduce((sum, score) => sum + parseFloat(score), 0) /
      autoScores.length
    ).toFixed(2);
    const avgTeleopScore = (
      teleopScores.reduce((sum, score) => sum + parseFloat(score), 0) /
      teleopScores.length
    ).toFixed(2);

    const hoverTexts = teams.map((team, index) => {
      return `Team: ${team}<br>Auto Score: ${autoScores[index]}<br>Teleop Score: ${teleopScores[index]}<br>Stage Score: ${stageScores[index]}<br>Total Score: ${totalScores[index]}`;
    });
    const trace = {
      x: autoScores,
      y: teleopScores,
      mode: "markers+text",
      type: "scatter",
      text: teams,
      hovertext: hoverTexts,
      marker: { size: 12, color: "#FF6030" },
      hoverlabel: {
        bgcolor: "white",
        font: { color: "black" },
      },
      hoverinfo: "text",
      textposition: "bottom center",
    };

    const layout = {
      title: "Team Scores Scattergram",
      xaxis: { title: "Average Auto Score" },
      yaxis: { title: "Average Teleop Score" },
      shapes: [
        {
          type: "line",
          x0: Math.min(...autoScores),
          x1: Math.max(...autoScores),
          y0: avgTeleopScore,
          y1: avgTeleopScore,
          line: {
            color: "blue",
            width: 2,
            dash: "dot",
          },
        },
        {
          type: "line",
          x0: avgAutoScore,
          x1: avgAutoScore,
          y0: Math.min(...teleopScores),
          y1: Math.max(...teleopScores),
          line: {
            color: "blue",
            width: 2,
            dash: "dot",
          },
        },
      ],
    };

    Plotly.newPlot(bubbleSheetContainer, [trace], layout);
  }

  async function setMatchModules(alliances) {
    for (const module of modules.match.left) {
      let displayedAlliances = alliances[0].filter((teamNumber) => {
        if (teamNumber == "|") {
          return false;
        }
        if (
          !module.moduleConfig.separate &&
          Object.keys(dataset.teams[teamNumber]).filter(
            (prop) => prop !== "manual"
          ).length == 0
        ) {
          return false;
        }
        return true;
      });
      if (module.moduleConfig.wholeMatch) {
        let allTeams = alliances[0];
        allTeams.push("|");
        allTeams = allTeams.concat(alliances[1]);
        displayedAlliances = allTeams.filter((teamNumber) => {
          if (
            !module.moduleConfig.separate &&
            teamNumber != "|" &&
            Object.keys(dataset.teams[teamNumber]).filter(
              (prop) => prop !== "manual"
            ).length == 0
          ) {
            return false;
          }
          return true;
        });
        if (displayedAlliances.length !== 0) {
          module.container.classList.remove("hidden");
          await module.setData(await module.formatData(allTeams, dataset));
        } else {
          module.container.classList.add("hidden");
        }
      }
      if (displayedAlliances.length !== 0) {
        module.container.classList.remove("hidden");
        await module.setData(
          await module.formatData(displayedAlliances, dataset)
        );
      } else {
        module.container.classList.add("hidden");
      }
    }

    for (const module of modules.match.right) {
      let displayedAlliances = alliances[1].filter((teamNumber) => {
        if (teamNumber == "|") {
          return false;
        }
        if (
          !module.moduleConfig.separate &&
          Object.keys(dataset.teams[teamNumber]).filter(
            (prop) => prop !== "manual"
          ).length == 0
        ) {
          return false;
        }
        return true;
      });
      if (module.moduleConfig.wholeMatch) {
        let allTeams = alliances[1];
        allTeams.push("|");
        allTeams = allTeams.concat(alliances[0]);
        displayedAlliances = allTeams.filter((teamNumber) => {
          if (
            !module.moduleConfig.separate &&
            teamNumber != "|" &&
            Object.keys(dataset.teams[teamNumber]).filter(
              (prop) => prop !== "manual"
            ).length == 0
          ) {
            return false;
          }
          return true;
        });
        if (displayedAlliances.length !== 0) {
          module.container.classList.remove("hidden");
          await module.setData(
            await module.formatData(displayedAlliances, dataset)
          );
        } else {
          module.container.classList.add("hidden");
        }
      }
      if (displayedAlliances.length !== 0) {
        module.container.classList.remove("hidden");
        await module.setData(
          await module.formatData(displayedAlliances, dataset)
        );
      } else {
        module.container.classList.add("hidden");
      }
    }
  }

  async function loadDashboard() {
    initDashboard(dataset, modulesConfig);
    loadTeams(dataset, modulesConfig);
    loadMatchView(dataset, modulesConfig);
    loadAutoPickList(dataset, modulesConfig);
    loadBubbleGraph(dataset, modulesConfig);
  }

  // New: Add event listener for the sidebar toggle button.
  document.getElementById("sidebar-toggle").addEventListener("click", toggleSidebar);

})();