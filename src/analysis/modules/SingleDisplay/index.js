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
		// teams = [b1,b2,b3,|,r1,r3,r3,|]
		let teamsArray = teams
		let summed 
		let formattedDisplay
		if(this.moduleConfig.wholeMatch) {
			let indexOfPipe = teamsArray.indexOf("|")
			let alliance1 = teamsArray.slice(0, indexOfPipe)
			// alliance 1 = [b1,b2,b3]
			let alliance2 = teamsArray.slice(indexOfPipe+1, teamsArray.length)
			alliance2 = alliance2.filter(team => team != "|")
			// alliance 2 = [r1,r2,r3]
			if (this.moduleConfig.options.aggrMethod == "percentChanceOfWinning") { //optionally percent chance of winning
				formattedDisplay = this.compareAlliances(alliance1, alliance2, dataset)
				formattedDisplay = (formattedDisplay * 100).toFixed(2).toString()+"%";
		 	} else { //default is undefined
					formattedDisplay = "0%"
			}
			
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
			if(!this.moduleConfig.wholeMatch){
				formattedDisplay = "—"
			}
			
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

	/**
	 * 
	 * @param {*an allaicne of any length*} alliance1 
	 * @param {*an alliance to compare to of any length*} alliance2 
	 * @param {*the data set that holds the infomation of the teams*} dataset 
	 * @returns {*the avg difference in score between allaicne 1 and allaicne 2*}
	 */
	matchAverage(alliance1, alliance2, dataset){
		let alliance1Avg = 0
		for (const a of alliance1) {
			alliance1Avg += getPath(dataset.teams[a],"averageScores.total",0)
		}
		let alliance2Avg = 0
		for (const a of alliance2) {
			alliance2Avg += getPath(dataset.teams[a],"averageScores.total",0)
		}
		return alliance1Avg - alliance2Avg
	}
	
	/**
	 * 
	 * @param {*an allaicne of any length*} alliance1 
	 * @param {*an alliance to compare to of any length*} alliance2 
	 * @param {*the data set that holds the infomation of the teams*} dataset 
	 * @returns {*the standard deveation of the given match*}
	 */
	matchStandardDeviation(alliance1, alliance2, dataset) {
		let alliance1SD = 0
		for (const a of alliance1) {
			let data = getPath(dataset.teams[a],"standardDeviation",0)
			alliance1SD += Math.pow(data, 2)
		}
		alliance1SD = Math.sqrt(alliance1SD)
		let alliance2SD = 0
		for (const a of alliance2) {
			let data = getPath(dataset.teams[a],"standardDeviation",0)
			alliance2SD += Math.pow(data, 2)
		}
		alliance2SD = Math.sqrt(alliance2SD)
		return Math.sqrt(Math.pow(alliance1SD, 2) + Math.pow(alliance2SD, 2))
	}
	
	/**
	 * 
	 * @param {*an allaicne of any length*} alliance1 
	 * @param {*an alliance to compare to of any length*} alliance2 
	 * @param {*the data set that holds the infomation of the teams*} dataset 
	 * @returns {*the percent chance that alliance1 will win this match*}
	 */
	compareAlliances(alliance1, alliance2, dataset) {
		let zscore = ss.zScore(0, this.matchAverage(alliance1, alliance2, dataset), this.matchStandardDeviation(alliance1, alliance2, dataset))
		let probAlliance2Wins = ss.cumulativeStdNormalProbability(zscore)
		return 1 - probAlliance2Wins;
	}

	
}