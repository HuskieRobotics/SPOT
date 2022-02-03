(async () => {
    const EVENT_ID = "2020ilch"
    const TBA_API_KEY = "35YGkhzv98FQInv2qLCZ6C9sixyhgU4hawV0oOS3jY0JikXVgAW2fKsAIKgZP8zx";
    //TODO: put api key into a server config and request
    const modules = {
        team: [],
        match: {
            left: [],
            right: []
        }
    }
    let dataset

    await loadAround(async () => {
        const modulesConfig = await fetch(`/analysis/analysis-modules.json`).then(res => res.json());
        dataset = await fetchDataset()
        initDashboard(dataset, modulesConfig)
        await new Promise(r => setTimeout(r, 300))
    })
    showFade(app)

    //data fetchers
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

    //team UI functions
    async function loadTeams(dataset, modulesConfig) {
        const allTeams = await fetchTeams()
        for (const [teamNumber, team] of Object.entries(dataset.teams)) {
            const teamContainer = constructTeam(teamNumber, team, allTeams)
            teamList.appendChild(teamContainer)
        }

        if (modulesConfig.map(m => m.position).includes("side")) {
            teamView.classList.add("side-enabled")
        } else {
            teamView.classList.remove("side-enabled")
        }

        for (const module of modulesConfig.filter(m => m.view == "team")) {
            const moduleObject = new moduleClasses[module.module](module)
            if (module.position == "main") {
                mainList.appendChild(moduleObject.container)
            } else {
                sideList.appendChild(moduleObject.container)
            }
            modules.team.push(moduleObject)
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

        teamContainer.addEventListener("click", async () => {
            await setTeamModules(teamNumber)
            displayTeam(teamContainer)
        })
        
        return teamContainer
    }

    function displayTeam(teamContainer) {
        resetAllSelected()
        teamContainer.classList.add("selected")
        showFade(teamView)
    }

    async function setTeamModules(teamNumber) {
        for (const module of modules.team) {
            await module.setData(await module.formatData([teamNumber], dataset))
        }
    }

    //match UI functions
    async function loadMatchView(dataset, modulesConfig) {
        matchViewSwitch.addEventListener("click", () => {
            resetAllSelected()
            matchViewSwitch.classList.add("selected")
            showFade(matchView)
        })

        const teamSelects = Array.from(document.querySelectorAll(".alliance-selects")).map(g => Array.from(g.children)).flat()
        for (const teamSelect of teamSelects) {
            for (const team of Object.keys(dataset.teams)) {
                const option = createDOMElement("option")
                option.innerText = team
                option.value = team
                teamSelect.appendChild(option)
            }

            teamSelect.addEventListener("change", async () => {
                if (teamSelect.value === "none") {
                    teamSelect.classList.remove("filled")
                } else {
                    teamSelect.classList.add("filled")
                }

                console.log(teamSelects.map(s => s.value))

                if (teamSelects.map(s => s.value).slice(0, 3).every(v => v === "none")) {
                    leftAllianceModules.classList.add("hidden")
                } else {
                    leftAllianceModules.classList.remove("hidden")
                }

                if (teamSelects.map(s => s.value).slice(3).every(v => v === "none")) {
                    rightAllianceModules.classList.add("hidden")
                } else {
                    rightAllianceModules.classList.remove("hidden")
                }

                await setMatchModules([teamSelects.slice(0, 3).map(s => s.value).filter(s => s !== "none"), teamSelects.slice(0, 3).map(s => s.value).filter(s => s !== "none")])
            })
        }

        for (const module of modulesConfig.filter(m => m.view == "match")) {
            const leftModuleObject = new moduleClasses[module.module](module)
            leftAllianceModules.appendChild(leftModuleObject.container)
            modules.match.left.push(leftModuleObject)

            const rightModuleObject = new moduleClasses[module.module](module)
            rightAllianceModules.appendChild(rightModuleObject.container)
            modules.match.right.push(rightModuleObject)
        }
    }

    async function setMatchModules(alliances) {
        console.log(alliances, modules)

        for (const module of modules.match.left) {
            await module.setData(await module.formatData(alliances[0], dataset))
        }

        for (const module of modules.match.right) {
            await module.setData(await module.formatData(alliances[1], dataset))
        }
    }

    //dashboard initializer (loads teams and match view)
    function initDashboard(dataset, modulesConfig) {
        loadTeams(dataset, modulesConfig)
        loadMatchView(dataset, modulesConfig)
    }

    //util
    function resetAllSelected() {
        Array.from(document.querySelector("#team-list").children).map(t => t.classList.remove("selected"))
        hideFade(welcomeView)
        hideFade(matchView)
        hideFade(teamView)
        matchViewSwitch.classList.remove("selected")
    }
})()