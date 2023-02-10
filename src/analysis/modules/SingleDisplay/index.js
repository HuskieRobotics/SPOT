class SingleDisplay {
    container;
    header;
    display;
    moduleConfig;

    constructor(moduleConfig) {
        this.moduleConfig = moduleConfig
        this.container = createDOMElement("div", "container single-display")
        this.header = createDOMElement("div", "header")
        this.display = createDOMElement("div", "display")
        this.container.appendChild(this.header)
        this.container.appendChild(this.display)
    }

    formatData(teams, dataset) {
		let teamsArray = [3061, "|", 3061]
		let summed 
		let formattedDisplay
		if(this.moduleConfig.wholeMatch) {
			console.log("this happened")
			console.log(`dataset ${dataset}`)
			// teams = [b1,b2,b3,|,r1,r3]
			// 1 split list of teams
			console.log(`teams: ${teamsArray}`)
			let indexOfPipe = teamsArray.indexOf("|")
			let alliance1 = teamsArray.slice(0, indexOfPipe)
			let alliance2 = teamsArray.slice(indexOfPipe+1, teamsArray.length)
			console.log(`alliances: ${alliance1} and ${alliance2}`)
			// if(alliance1.length > 0){ // 2 validate alliances have at least 1 robot
			// 	if (this.moduleConfig.options.aggrMethod == "percentChanceOfWin") {	// 3 identify which calculation to perform
			// 		// 4 send output to formattedDisplay
			// 		console.log("this is good")
			console.log("Compared Alliances" + this.compareAlliances(alliance1,alliance2, dataset))
			formattedDisplay = this.compareAlliances(alliance1, alliance2, dataset)
			// 	} else { //default is undefined
			// 		console.log("bad")
			// 		formattedDisplay = 0
			// 		console.log("Compared Alliances" + this.compareAlliances(alliance1,alliance2, dataset))
			// 		formattedDisplay = this.compareAlliances(alliance1, alliance2)
			// 	}
			
			// } else {
			// 	console.log("also bad")
			// 	formattedDisplay = 0
			// }
		} else {
			if (teams.length > 1) {
				summed = teams.map(team => getPath(dataset.teams[team], this.moduleConfig.options.path, 0)).flat().reduce((acc, i) => acc + i, 0)
			} else {
				summed = getPath(dataset.teams[teams[0]], this.moduleConfig.options.path, 0)
			}

			if (this.moduleConfig.options.aggrMethod == "sum") { //optionally summed
				formattedDisplay = summed
			} else { //default is average
				formattedDisplay = summed / teams.length
			}
		}
		formattedDisplay = this.applyModifiers(formattedDisplay)

		if (isNaN(formattedDisplay) || formattedDisplay == this.moduleConfig.options.hideIfValue) {
			formattedDisplay = "—"
		} else {
			if (this.moduleConfig.options.decimals !== undefined) {
				formattedDisplay = formattedDisplay.toFixed(this.moduleConfig.options.decimals)
			}

			if (this.moduleConfig.options.unit) {
				formattedDisplay += this.moduleConfig.options.unit
			}
		}
        return formattedDisplay
    }

	applyModifiers(value) {
		if (this.moduleConfig.options.multiplier !== undefined) {
			value *= this.moduleConfig.options.multiplier
		}

		if (this.moduleConfig.options.addend !== undefined) {
			value += this.moduleConfig.options.addend
		}

		return value
	}

    setData(data) {
        this.header.innerText = this.moduleConfig.name
        this.display.innerText = data
    }

	matchAverage(alliance1, alliance2, dataset){
		let alliance1Avg = 0
		// for (const a of alliance1) {
		// 	console.log("a AVG" + getPath(Object.entries(dataset.teams)[a],"averageScores",0))
		// 	alliance1Avg += getPath(Object.entries(dataset.teams)[a],"averageScores",0)
		// }
		let alliance2Avg = 0
		// for (const a of alliance2) {
		// 	console.log("a AVG" + getPath(Object.entries(dataset.teams)[a],"averageScores",0))
		// 	alliance1Avg += getPath(Object.entries(dataset.teams)[a],"averageScores",0)
		// }
		return alliance1Avg - alliance2Avg
	}
	
	matchStandardDeviation(alliance1, alliance2, dataset) {
		let alliance1SD = 0
		// for (const a of alliance1) {
		// 	console.log("a SD" + getPath(Object.entries(dataset.teams)[a],"standardDeviation",0))
		// 	let data = getPath(Object.entries(dataset.teams)[a],"standardDeviation",0)
		// 	alliance1SD += Math.pow(data, 2)
		// }
		alliance1SD = Math.sqrt(alliance1SD)
		let alliance2SD = 0
		// for (const a of alliance2) {
		// 	console.log("a SD" + getPath(Object.entries(dataset.teams)[a],"standardDeviation",0))
		// 	let data = getPath(Object.entries(dataset.teams)[a],"standardDeviation",0)
		// alliance1SD += Math.pow(data, 2)
		// }
		alliance2SD = Math.sqrt(alliance2SD)
		return Math.sqrt(Math.pow(alliance1SD, 2) + Math.pow(alliance2SD, 2))
	}
	
	compareAlliances(alliance1, alliance2, dataset) {
		zscore = ss.zScore(0, this.matchAverage(alliance1, alliance2, dataset), this.matchStandardDeviation(alliance1, alliance2, dataset))
		probAlliance2Wins = ss.cumulativeStdNormalProbability(zscore)
		return 1 - probAlliance2Wins;
	}

	
}