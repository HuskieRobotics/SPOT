class Stats {
    container;
    header;
    list;
    moduleConfig;

    constructor(moduleConfig) {
        this.moduleConfig = moduleConfig
        this.container = createDOMElement("div", "container stats")
        this.header = createDOMElement("div", "header")
        this.list = createDOMElement("div", "list")
        this.container.appendChild(this.header)
        this.container.appendChild(this.list)
    }

    formatData(teams, dataset) {
        const data = []
        for (const stat of this.moduleConfig.options.list) {
            let formattedStat
            let summed = teams.map(team => getPath(dataset.teams[team], stat.path)).flat().reduce((acc, i) => acc + i, 0)
            
            console.log(summed)

            if (stat.aggrMethod == "sum") { //optionally summed
                formattedStat = summed
            } else { //default is average
                formattedStat = summed / teams.length
            }

            // console.log(formattedStat)
            
            if (stat.multiplier !== undefined) {
                formattedStat *= stat.multiplier
            }

            if (stat.decimals !== undefined) {
                formattedStat = formattedStat.toFixed(stat.decimals)
            }

            if (stat.unit) {
                formattedStat += stat.unit
            }

            data.push({
                name: stat.name,
                value: formattedStat
            })
        }

        return data
    }

    setData(data) {
        this.header.innerText = this.moduleConfig.name
        clearDiv(this.list)
        for (const stat of data) {
            const statElement = createDOMElement("div", "stat")
            statElement.innerHTML = `<strong>${stat.name}:</strong> ${stat.value}`
            this.list.appendChild(statElement)
        }
    }
}