//load the service worker, allows for offline analysis
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js').then(function (registration) {
            // Registration was successful
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
        }, function (err) {
            // registration failed
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}

(async () => {
    //modules object strucutre
    const modules = {
        team: [],
        match: {
            left: [],
            right: []
        }
    }

    //start loading animation, fetch modules config, fetch dataset, then initialize UI elements
    let dataset
    await loadAround(async () => {
        const modulesConfig = await fetch(`/config/analysis-modules.json`).then(res => res.json());
        dataset = await fetchDataset()
        console.log(dataset)
        initDashboard(dataset, modulesConfig)
        await new Promise(r => setTimeout(r, 300))
    })
    showFade(app)

    //data fetchers
    async function fetchDataset() {
        return await fetch("./api/dataset").then(res => res.json())
    }

    async function fetchTeams() {
        const teams = await fetch(`/analysis/api/teams`).then(res => res.json())
        return teams.reduce((acc, t) => {
            acc[t.team_number] = t.nickname
            return acc
        }, {})
    }

    //team UI functions
    async function loadTeams(dataset, modulesConfig) {
        //get blue alliance teams
        const allTeams = await fetchTeams()
        //add to sidebar team list
        for (const [teamNumber, team] of Object.entries(dataset.teams)) {
            const teamContainer = constructTeam(teamNumber, team, allTeams)
            teamList.appendChild(teamContainer)
        }

        //enable sidebar if sidebar modules exist
        if (modulesConfig.map(m => m.position).includes("side")) {
            teamView.classList.add("side-enabled")
        } else {
            teamView.classList.remove("side-enabled")
        }

        //get all team modules, create and store module classes, then append their placeholder containers to lists
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
        //create and populate sidebar element
        const teamContainer = createDOMElement("div", "team-container")
        const teamNumDisplay = createDOMElement("div", "team-number")
        teamNumDisplay.innerText = teamNumber
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

    //reset UI and switch to team view
    function displayTeam(teamContainer) {
        clearInterface()
        teamContainer.classList.add("selected")
        showFade(teamView)
    }

    //call setData on every module in teams
    async function setTeamModules(teamNumber) {
        for (const module of modules.team) {
            await module.setData(await module.formatData([teamNumber], dataset))
        }
    }

    //match UI functions
    async function loadMatchView(dataset, modulesConfig) {
        //add event listener to "Simulate Match" button to set reset UI and switch to match view
        matchViewSwitch.addEventListener("click", () => {
            clearInterface()
            matchViewSwitch.classList.add("selected")
            showFade(matchView)
        })

        //get all dropdowns
        const teamSelects = Array.from(document.querySelectorAll(".alliance-selects")).map(g => Array.from(g.children)).flat()

        //populate dropdowns with team numbers
        for (const teamSelect of teamSelects) {
            for (const team of Object.keys(dataset.teams)) {
                const option = createDOMElement("option")
                option.innerText = team
                option.value = team
                teamSelect.appendChild(option)
            }

            //on dropdown change
            teamSelect.addEventListener("change", async () => {
                //apply dropdown border style if selected
                if (teamSelect.value === "none") {
                    teamSelect.classList.remove("filled")
                } else {
                    teamSelect.classList.add("filled")
                }

                //hide alliance module lists if no teams are selected for that alliance
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

                //set data on match modules
                await setMatchModules([teamSelects.slice(0, 3).map(s => s.value).filter(s => s !== "none"), teamSelects.slice(3).map(s => s.value).filter(s => s !== "none")])
            })
        }

        //create match module objects and append placeholders to module list elements
        for (const module of modulesConfig.filter(m => m.view == "match")) {
            const leftModuleObject = new moduleClasses[module.module](module)
            leftAllianceModules.appendChild(leftModuleObject.container)
            modules.match.left.push(leftModuleObject)

            const rightModuleObject = new moduleClasses[module.module](module)
            rightAllianceModules.appendChild(rightModuleObject.container)
            modules.match.right.push(rightModuleObject)
        }
    }

    //call setData on every module in matches
    async function setMatchModules(alliances) {
        for (const module of modules.match.left) {
            await module.setData(await module.formatData(alliances[0], dataset))
        }

        for (const module of modules.match.right) {
            await module.setData(await module.formatData(alliances[1], dataset))
        }
    }

    //dashboard initializer, loads teams and match view
    function initDashboard(dataset, modulesConfig) {
        loadTeams(dataset, modulesConfig)
        loadMatchView(dataset, modulesConfig)
    }

    //reset the UI to state of nothing shown, nothing selected
    function clearInterface() {
        Array.from(document.querySelector("#team-list").children).map(t => t.classList.remove("selected"))
        hideFade(welcomeView)
        hideFade(matchView)
        hideFade(teamView)
        matchViewSwitch.classList.remove("selected")
    }
})()