

async function fetchTeams() {
	const teams = await fetch(`/analysis/api/teams`).then(res => res.json())
	return teams.reduce((acc, t) => {
		acc[t.team_number] = t.nickname
		return acc
	}, {})
}
async function loadTeamsPickList(dataset, modulesConfig) {
	//get blue alliance teams
	const allTeams = await fetchTeams();
	//add to sidebar team list
	for (const [teamNumber, team] of Object.entries(dataset.teams)) {
		const PickListTeamContainer = constructTeam(teamNumber, team, allTeams)
		pickList.appendChild(PickListTeamContainer)
	}

}

function constructTeam(teamNumber, team, allTeams) {
	//create and populate sidebar element
	const teamContainer = createDOMElement("div", "team-container")
	const teamNumDisplay = createDOMElement("div", "team-number")
	teamNumDisplay.innerText = teamNumber
	teamContainer.setAttribute("num", teamNumber)
	teamContainer.appendChild(teamNumDisplay)
	if (allTeams) {
		const teamNameDisplay = createDOMElement("div", "team-name")
		teamNameDisplay.innerText = allTeams[teamNumber]
		teamContainer.appendChild(teamNameDisplay)
	}

	//switch to team on click of sidebar team, set module data
	teamContainer.addEventListener("click", async () => {
		await setTeamModules(teamNumber)
		displayTeam(teamContainer)
	})

	return teamContainer
}