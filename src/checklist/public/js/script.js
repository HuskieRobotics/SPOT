
// temporarily not using access code

// ;(async () => {
//     const authRequest = await fetch("./api/auth").then(res => res.json())

//     if (authRequest.status !== 2) {
//         const authModal = new Modal("small", false).header("Sign In")
//         const accessCodeInput = createDOMElement("input", "access-input")
//         accessCodeInput.placeholder = "Access Code"
//         accessCodeInput.type = "password"
//         accessCodeInput.addEventListener("keydown", (e) => {
//             if (e.keyCode == 13) {
//                 validate(accessCodeInput.value, authModal)
//             }
//         })
//         authModal.element.appendChild(accessCodeInput)
//         authModal.action("Submit", async () => {
//             validate(accessCodeInput.value, authModal)
//         })
//     } else {
//         await constructApp()
//     }

//     async function validate(accessCode, authModal) {
//         const auth = await fetch("./api/auth", {
//             headers: {
//                 Authorization: accessCode
//             }
//         }).then(res => res.json())

//         if (auth.status === 1) {
//             await constructApp(accessCode)
//             authModal.modalExit()
//         } else {
//             new Popup("error", "Wrong Access Code")
//         }
//     }
// })()

// async function constructApp(accessCode) {

// }

(async () => {

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


    
    

})