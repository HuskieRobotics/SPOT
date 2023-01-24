

async function fetchTeams() {
	const teams = await fetch(`/analysis/api/teams`).then(res => res.json())
	return teams.reduce((acc, t) => {
		acc[t.team_number] = t.nickname
		return acc
	}, {})
}
async function loadTeamsPickList(dataset) {
	//get blue alliance teams
	const allTeams = await fetchTeams();
	//add to sidebar team list
	for (const [teamNumber, team] of Object.entries(dataset.teams)) {
		const PickListTeamContainer = constructTeam(teamNumber, team, allTeams)
		pickList.appendChild(PickListTeamContainer)
	}

}

//reset UI and switch to team view
function displayTeam(teamContainer) {
	//clearInterface()
	teamContainer.classList.add("selected")
	showFade(teamView)
}


function constructTeam(teamNumber, team, allTeams) {

	const teamContainer = createDOMElement("button", "team-container") // need to activate the button
	const teamNumDisplay = createDOMElement("div", "team-number")
	teamNumDisplay.innerText = teamNumber
	teamContainer.setAttribute("num", teamNumber)
	teamContainer.appendChild(teamNumDisplay)
	if (allTeams) {
		const teamNameDisplay = createDOMElement("div", "team-name")
		teamNameDisplay.innerText = allTeams[teamNumber]
		teamContainer.appendChild(teamNameDisplay)
	}

	//
	teamContainer.addEventListener("click", async () => {
		teamContainer.classList.toggle("hidden");
		
		//teamContainer.classList.add("selected")
		displayTeam(teamContainer)
	})

	return teamContainer
}

async function fetchDataset() {
	return await fetch("/analysis/api/dataset").then(res => res.json())
}

(async ()=>{
	var data = await fetchDataset();
	loadTeamsPickList(data);
})();
