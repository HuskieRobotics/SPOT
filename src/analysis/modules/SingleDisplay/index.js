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
		let summed
		if(this.moduleConfig.wholeMatch) {
			// teams = [b1,b2,b3,|,r1,r3]
			// 1 split list of teams
			let indexOfPipe = teams.idexOF("|")
			let alliance1 = teams.slice(0, indexOfPipe)
			let alliance2 = teams.slice(indexOfPipe-1, teams.length)
			if(alliance1.length > 0){ // 2 validate alliances have at least 1 robot
				if (this.moduleConfig.options.aggrMethod == "percentChanceOfWin") {	// 3 identify which calculation to perform
					// 4 send output to formattedDisplay
					formattedDisplay = this.percentChanceOfWinning(alliance1, alliance2)
				} 
				else { //default is undefined
					formattedDisplay = 0
				}
			
			} 
			else {
				
			}
		}
		else {
			if (teams.length > 1) {
				summed = teams.map(team => getPath(dataset.teams[team], this.moduleConfig.options.path, 0)).flat().reduce((acc, i) => acc + i, 0)
			} else {
				summed = getPath(dataset.teams[teams[0]], this.moduleConfig.options.path, 0)
			}

			let formattedDisplay
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
}