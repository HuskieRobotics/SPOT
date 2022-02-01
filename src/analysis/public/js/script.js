(async () => {
    const EVENT_ID = "2020ilch"
    const TBA_API_KEY = "35YGkhzv98FQInv2qLCZ6C9sixyhgU4hawV0oOS3jY0JikXVgAW2fKsAIKgZP8zx";
    //TODO: put api key into a server config and request
    const modules = []
    let dataset

    await loadAround(async () => {
        const modulesConfig = await fetch(`/analysis/analysis-modules.json`).then(res => res.json());
        dataset = await fetchDataset()
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

        teamContainer.addEventListener("click", () => {
            setTeamModules(teamNumber)
            displayTeam(teamContainer)
        })
        
        return teamContainer
    }

    function initDashboard(modulesConfig) {
        if (modulesConfig.map(m => m.position).includes("side")) {
            teamView.classList.add("side-enabled")
        } else {
            teamView.classList.remove("side-enabled")
        }

        for (const module of modulesConfig) {
            const moduleObject = new moduleClasses[module.module](module)
            if (module.position == "main") {
                mainList.appendChild(moduleObject.container)
            } else {
                sideList.appendChild(moduleObject.container)
            }
            modules.push(moduleObject)
        }
    }

    function displayTeam(teamContainer) {
        hideFade(welcomeView)
        showFade(teamView)
        Array.from(document.querySelector("#team-list").children).map(t => t.classList.remove("selected"))
        teamContainer.classList.add("selected")
    }

    function setTeamModules(teamNumber) {
        for (const module of modules) {
            module.setData(teamNumber, dataset)
        }
    }
})()

