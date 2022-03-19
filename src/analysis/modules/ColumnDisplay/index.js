class ColumnDisplay {
    container;
    header;
    displayContainer;
    moduleConfig;

    constructor(moduleConfig) {
        this.moduleConfig = moduleConfig
        this.container = createDOMElement("div", "container column-display")
        this.header = createDOMElement("div", "header")
        this.displayContainer = createDOMElement("div", "display-container")
        this.container.appendChild(this.header)
        this.container.appendChild(this.displayContainer)
    }

    formatData(teams, dataset) {
		let summed
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

		formattedDisplay = this.applyModifiers(formattedDisplay)

		if (isNaN(formattedDisplay) || formattedDisplay == this.moduleConfig.options.hideIfValue) {
			formattedDisplay = "—"
		} else {
			if (this.moduleConfig.options.decimals !== undefined) {
				formattedDisplay = formattedDisplay.toFixed(this.moduleConfig.options.decimals)
			}

			if (this.moduleConfig.options.unit) {
				formattedStat += this.moduleConfig.options.unit
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