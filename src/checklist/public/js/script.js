//get teams from the team list
async function fetchTeams() {
  const teams = await fetch(`/analysis/api/teams`).then((res) => res.json());
  return teams.reduce((acc, t) => {
    acc[t.team_number] = t.nickname;
    return acc;
  }, {});
}
async function loadTeamsPickList(dataset) {
  //get blue alliance teams
  const allTeams = await fetchTeams();
  //add to pick list
  for (const [teamNumber, team] of Object.entries(dataset.teams)) {
    const PickListTeamContainer = constructTeam(teamNumber, team, allTeams);
    pickList.appendChild(PickListTeamContainer);
  }
}

//makes buttons toggleable
function displayTeam(teamContainer) {
  teamContainer.classList.toggle("selected");
  showFade(teamView);
}

// create team containers
function constructTeam(teamNumber, team, allTeams) {
  const teamContainer = createDOMElement("button", "team-container");
  const teamNumDisplay = createDOMElement("div", "team-number");
  teamNumDisplay.innerText = teamNumber;
  teamContainer.setAttribute("num", teamNumber);
  teamContainer.appendChild(teamNumDisplay);
  if (allTeams) {
    const teamNameDisplay = createDOMElement("div", "team-name");
    teamNameDisplay.innerText = allTeams[teamNumber];
    teamContainer.appendChild(teamNameDisplay);
  }
  // listens for button clicked
  teamContainer.addEventListener("click", async () => {
    displayTeam(teamContainer);
  });

  return teamContainer;
}

// grabs data set
async function fetchDataset() {
  return await fetch("/analysis/api/dataset").then((res) => res.json());
}

(async () => {
  var data = await fetchDataset();
  loadTeamsPickList(data);
})();
