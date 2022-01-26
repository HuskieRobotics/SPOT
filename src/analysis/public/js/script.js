(async () => {
    const EVENT_ID = "2020ilch"
    const TBA_API_KEY = "35YGkhzv98FQInv2qLCZ6C9sixyhgU4hawV0oOS3jY0JikXVgAW2fKsAIKgZP8zx";
    //TODO: put api key into a server config and request
    const modulesConfig = await fetch(`/analysis/analysis-modules.json`).then(res => res.json());
    const moduleClasses = []

    await loadAround(async () => {
        const dataset = await fetchDataset()
        console.log(dataset)
        loadTeams(dataset)
        initDashboard(modulesConfig)
        await new Promise(r => setTimeout(r, 300))
    })
    showFade(app)


    async function fetchDataset() {
        return await fetch("./api/dataset").then(res => res.json())
    }
    
    async function fetchTeams() {
        const teams = await fetch(`https://www.thebluealliance.com/api/v3/event/${EVENT_ID}/teams?X-TBA-Auth-Key=${TBA_API_KEY}`).then(res => res.json())
        return teams.reduce((acc, t) => {
            acc[t.team_number] = t.nickname
            return acc
        }, {})
    }
    
    async function loadTeams(dataset) {
        const allTeams = await fetchTeams()
        for (const [teamNumber, team] of Object.entries(dataset.teams)) {
            const teamContainer = constructTeam(teamNumber, team, allTeams)
            teamList.appendChild(teamContainer)
        }
    }

    function constructTeam(teamNumber, team, allTeams) {
        const teamContainer = createDOMElement("div", "team-container")
        const teamNumDisplay = createDOMElement("div", "team-number")
        teamNumDisplay.innerText = teamNumber
        teamContainer.appendChild(teamNumDisplay)
        if (allTeams) {
            const teamNameDisplay = createDOMElement("div", "team-name")
            teamNameDisplay.innerText = allTeams[teamNumber]
            teamContainer.appendChild(teamNameDisplay)
        }
        
        return teamContainer
    }

    function initDashboard(modulesConfig) {
        if (modulesConfig.map(m => m.position).includes("side")) {
            teamView.classList.add("sidebar-enabled")
        }

        for (const module of modulesConfig) {
            if (module.type == "stats") {
                module.classes.push(new Stats(module.position))
            }
        }
    }

    function displayTeam(teamNumber) {
        for (const module of moduleClasses) {
            module.setData(teamNumber)
        }
    }
})()

