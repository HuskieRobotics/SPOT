class ColumnDisplay {
    container;
    header;
    displaysContainer;
    moduleConfig;

    constructor(moduleConfig) {
        this.moduleConfig = moduleConfig
        this.container = createDOMElement("div", "container column-display")
        this.header = createDOMElement("div", "header")
        this.displaysContainer = createDOMElement("div", "displays-container")
        this.container.appendChild(this.header)
        this.container.appendChild(this.displaysContainer)
    }

    formatData(teams, dataset) {
		const data = []
		for (const team of teams) {
			let formattedDisplay = getPath(dataset.teams[team], this.moduleConfig.options.path, this.moduleConfig.options.string ? "—" : 0)

			formattedDisplay = this.applyModifiers(formattedDisplay)

			let statRank
			let totalRanked
			if (!this.moduleConfig.options.string && (isNaN(formattedDisplay) || formattedDisplay == this.moduleConfig.options.hideIfValue)) {
				formattedDisplay = "—"
			} else {
				if (this.moduleConfig.options.sort !== 0 && this.moduleConfig.options.sort !== undefined) {
					const filteredTeams = Object.keys(dataset.teams).filter(team => {
						let teamStatToFilter = getPath(dataset.teams[team], this.moduleConfig.options.path, 0)
						teamStatToFilter = this.applyModifiers(teamStatToFilter)

						return (!isNaN(teamStatToFilter) && teamStatToFilter != this.moduleConfig.options.hideIfValue)
					})

					totalRanked = filteredTeams.length
					const rankedTeams = filteredTeams.sort((a, b) => (this.applyModifiers(getPath(dataset.teams[b], this.moduleConfig.options.path, 0)) - this.applyModifiers(getPath(dataset.teams[a], this.moduleConfig.options.path, 0))) * this.moduleConfig.options.sort)
					statRank = rankedTeams.indexOf(team) + 1
				}

				if (this.moduleConfig.options.decimals !== undefined) {
					formattedDisplay = formattedDisplay.toFixed(this.moduleConfig.options.decimals)
				}

				if (this.moduleConfig.options.unit) {
					formattedDisplay += this.moduleConfig.options.unit
				}
			}

			data.push({
				team: team,
				value: formattedDisplay,
				rank: statRank,
				totalRanked: totalRanked
			})
		}

        return data
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
        clearDiv(this.displaysContainer)
		for (const teamData of data) {
			const teamDisplayContainer = createDOMElement("div", "team-display-container")
			const teamValue = createDOMElement("div", "team-value")
			teamValue.innerText = teamData.value
			const teamNum = createDOMElement("div", "team-num")
			teamNum.innerText = teamData.team

			teamDisplayContainer.appendChild(teamValue)
			teamDisplayContainer.appendChild(teamNum)

			if (teamData.rank) {
				let rankClass = "top100"
				if (teamData.rank <= Math.round(teamData.totalRanked * 0.05)) {
					rankClass = "top5"
				} else if (teamData.rank <= Math.round(teamData.totalRanked * 0.25)) {
					rankClass = "top25"
				} else if (teamData.rank <= Math.round(teamData.totalRanked * 0.5)) {
					rankClass = "top50"
				}
				const teamRank = createDOMElement("div", `team-rank ${rankClass}`)
				teamRank.innerText = `#${teamData.rank}`
				teamDisplayContainer.appendChild(teamRank)
			}
			
			this.displaysContainer.appendChild(teamDisplayContainer)
		}
    }
}