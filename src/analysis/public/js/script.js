//load the service worker, allows for offline analysis
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").then(
      function (registration) {
        // Registration was successful
        console.log(
          "ServiceWorker registration successful with scope: ",
          registration.scope
        );
      },
      function (err) {
        // registration failed
        console.log("ServiceWorker registration failed: ", err);
      }
    );
  });
}

(async () => {
  //modules object strucutre
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
    //get blue alliance teams
    const allTeams = await fetchTeams();
    //add to sidebar team list
    for (const [teamNumber, team] of Object.entries(dataset.teams)) {
      // console.log(`team: ${Object.keys(team)}\n num: ${teamNumber}\n allTeams: ${allTeams[teamNumber]}`)
      if (allTeams[teamNumber]) {
        const teamContainer = constructTeam(teamNumber, team, allTeams);
        teamList.appendChild(teamContainer);
      }
    }

    //enable sidebar if sidebar modules exist
    if (modulesConfig.map((m) => m.position).includes("side")) {
      teamView.classList.add("side-enabled");
    } else {
      teamView.classList.remove("side-enabled");
    }

    //get all team modules, create and store module classes, then append their placeholder containers to lists
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

  // Creates individual team div for the sidebar - called in loadTeams
  // 		creates event listener for the div that listens for click
  function constructTeam(teamNumber, team, allTeams) {
    //create and populate sidebar element
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

    // Create event listener that switches to team view on click
    teamContainer.addEventListener("click", async () => {
      await setTeamModules(teamNumber);
      displayTeam(teamContainer);
    });

    return teamContainer;
  }

  //creates list of teams for auto pick list tab
  async function loadTeamsAutoPick(dataset, modulesConfig) {
    // reset autoPickTeamList html
    autoPickTeamList.innerHTML = "";

    //get blue alliance teams
    const allTeams = await fetchTeams();

    // get an array (teams) of all teams that contain data
    var teams = [];
    for (var [teamNumber, team] of Object.entries(dataset.teams)) {
      console.log("team: ");
      console.log(team);
      console.log("team number: ");
      console.log(teamNumber);
      if (
        dataset.tmps.filter((tmp) => tmp.robotNumber == teamNumber).length >
          0 &&
        allTeams[teamNumber]
      ) {
        //
        //console.log("added team: ")
        //console.log(team);
        setPath(team, "robotNumber", teamNumber);
        console.log("data from path: " + getPath(team, "robotNumber"));
        teams.push(team);

        console.log("TEAM ADDED " + teamNumber);

        console.log("team number of first team: ");
        console.log(teams[0].robotNumber);
        console.log(teams);
      }
      console.log("-----------------");
    }
    console.log("teams before avgprob");
    console.log(teams);
    //console.log("teams type and size: " + typeof(teams)+teams.length+teams[0])

    let teamsProbability = await fetch("/analysis/autoPick").then((res) =>
      res.json()
    );
    console.log("teams w/ avg probability");
    console.log(teamsProbability);
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

    // sort teams by avg win probability using bubble sort
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

    //add to team list on autopicktab
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

    //get all team modules, create and store module classes, then append their placeholder containers to lists
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
      console.log("clicked");
    }, 4);
  }

  // Creates the div/display box for each team on the autoPickTeamList - called in loadTeamsAutoPick function
  //    Creates an event listener for the div that listens for a click
  function constructTeamAutoPick(teamNumber, team, allTeams) {
    //create and populate autoPickTeamList element
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

    // Create event listener for the div that switches the stats displayed to its team on click
    teamContainer.addEventListener("click", async () => {
      await setTeamModules(teamNumber);
      displayStats(teamContainer);
    });

    return teamContainer;
  }

  // Displays team view - resets the UI and switch to team view
  // 		Called from event listener in each sidebar team div created in constructTeam function
  function displayTeam(teamContainer) {
    clearInterface();
    teamContainer.classList.add("selected");
    showFade(teamView);
  }

  // Display autoPickList stats for the team that is clicked on -
  // 		called from the event listener in constructTeamsAutoPick
  function displayStats(teamContainer) {
    Array.from(document.querySelector("#auto-pick-team-list").children).map(
      (t) => t.classList.remove("selected")
    );
    teamContainer.classList.add("selected");
    autoPickStats.style.display = "block";
    autoPickMain.style.display = "flex";
  }

  //call setData on every module in teams
  async function setTeamModules(teamNumber) {
    for (const module of modules.team) {
      if (
        !module.moduleConfig.separate &&
        Object.keys(dataset.teams[teamNumber]).filter(
          (prop) => prop !== "manual"
        ).length == 0
      ) {
        // console.log(`would add hidden: ${teamNumber}`)
        // console.log(Object.keys(module.moduleConfig))
        if (module.moduleConfig.position == "side") {
          await module.setData(await module.formatData([teamNumber], dataset));
        }
        module.container.classList.add("hidden");
      } else {
        // console.log(`not adding hidden: ${teamNumber}`)
        module.container.classList.remove("hidden");
        await module.setData(await module.formatData([teamNumber], dataset));
      }
    }
    autoPickStats.style.display = "none";
    autoPickMain.style.display = "none";
  }

  //match UI functions
  async function loadMatchView(dataset, modulesConfig) {
    //add event listener to "Simulate Match" button to set reset UI and switch to match view
    matchViewSwitch.addEventListener("click", () => {
      clearInterface();
      matchViewSwitch.classList.add("selected");
      showFade(matchView);
    });

    const matchSelect = document.querySelector("#match-select");
    for (const match of matches) {
      const option = createDOMElement("option");
      option.innerText = match.match_string.split("_")[1].toUpperCase();
      option.value = match.match_string;
      matchSelect.appendChild(option);
    }

    //get all dropdowns
    const teamSelects = Array.from(
      document.querySelectorAll(".alliance-selects")
    )
      .map((g) => Array.from(g.children))
      .flat();
    const allTeams = await fetchTeams();
    //populate dropdowns with team numbers
    for (const teamSelect of teamSelects) {
      for (const team of Object.keys(dataset.teams)) {
        // console.log(team)
        if (allTeams[team]) {
          const option = createDOMElement("option");
          option.innerText = team;
          option.value = team;
          teamSelect.appendChild(option);
        }
      }

      //on dropdown change
      teamSelect.addEventListener("change", async () => {
        matchSelect.value = "none";
        matchSelect.classList.remove("filled");

        //apply dropdown border style if selected
        if (teamSelect.value === "none") {
          teamSelect.classList.remove("filled");
        } else {
          teamSelect.classList.add("filled");
        }

        //hide alliance module lists if no teams are selected for that alliance
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

        //set data on match modules
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

        //hide alliance module lists if no teams are selected for that alliance
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

        //set data on match modules
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

    //create match module objects and append placeholders to module list  elements
    for (const module of modulesConfig.filter((m) => m.view == "match")) {
      const leftModuleObject = new moduleClasses[module.module](module);
      leftAllianceModules.appendChild(leftModuleObject.container);
      modules.match.left.push(leftModuleObject);

      const rightModuleObject = new moduleClasses[module.module](module);
      rightAllianceModules.appendChild(rightModuleObject.container);
      modules.match.right.push(rightModuleObject);
    }
  }

  // Auto pick list UI functions
  async function loadAutoPickList(dataset, modulesConfig) {
    //add event listener to "AutoPickList" button to set reset UI and switch to autopicklist tab
    autoPickSwitch.addEventListener("click", () => {
      clearInterface();
      autoPickSwitch.classList.add("selected");
      loadTeamsAutoPick(dataset, modulesConfig);
      showFade(autoPickView);
    });
  }

  //call setData on every module in matches
  async function setMatchModules(alliances) {
    for (const module of modules.match.left) {
      console.log(module.moduleConfig.name);
      var displayedAlliances = alliances[0].filter((teamNumber) => {
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
        console.log(`alliances script.js ${alliances}`);
        allTeams.push("|");
        allTeams = allTeams.concat(alliances[1]);
        console.log(`all teams: ${allTeams}`);
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
        console.log(`displayed alliances: ${displayedAlliances}`);
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
      console.log(module.moduleConfig.name);
      var displayedAlliances = alliances[1].filter((teamNumber) => {
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
        console.log(`all teams: ${allTeams}`);
        var displayedAlliances = allTeams.filter((teamNumber) => {
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
        console.log(`displayed alliances: ${displayedAlliances}`);
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

  //dashboard initializer, loads teams, match view, and autopicklist
  function initDashboard(dataset, modulesConfig) {
    loadTeams(dataset, modulesConfig);
    loadMatchView(dataset, modulesConfig);
    loadAutoPickList(dataset, modulesConfig);

    searchInput.addEventListener("input", () => {
      if (searchInput.value !== "") {
        const sortedTeams = fuzzysort.go(
          searchInput.value,
          Object.keys(dataset.teams),
          {
            allowTypo: true,
          }
        );
        console.log(sortedTeams);
        for (const team of Array.from(teamList.children)) {
          team.style.display = "none";
        }
        for (const sortResult of sortedTeams) {
          const toAppend = Array.from(teamList.children).find(
            (teamElement) =>
              teamElement.getAttribute("num") == sortResult.target
          );
          teamList.appendChild(toAppend);
          toAppend.style.display = "flex";
        }
      } else {
        for (const team of Array.from(teamList.children).sort((a, b) => {
          const aLength = a.getAttribute("num").length;
          const bLength = b.getAttribute("num").length;
          if (aLength == bLength) {
            return a.getAttribute("num").localeCompare(b.getAttribute("num"));
          } else {
            return aLength - bLength;
          }
        })) {
          teamList.appendChild(team);
          team.style.display = "flex";
        }
      }
    });
  }

  //reset the UI to state of nothing shown, nothing selected
  function clearInterface() {
    Array.from(document.querySelector("#team-list").children).map((t) =>
      t.classList.remove("selected")
    );

    hideFade(welcomeView);
    hideFade(matchView);
    hideFade(teamView);
    hideFade(autoPickView);
    // hideFade(autoPickStats)
    // hideFade(autoPickMain)
    autoPickStats.style.display = "none";
    autoPickMain.style.display = "none";
    matchViewSwitch.classList.remove("selected");
    autoPickSwitch.classList.remove("selected");
  }
})();
