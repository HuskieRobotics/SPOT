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

    setData(team, dataset) {
        this.header.innerText = this.moduleConfig.name
        clearDiv(this.list)
        console.log(this.moduleConfig)
        for (const [statName, stat] of Object.entries(this.moduleConfig.options.list)) {
            this.stat = createDOMElement("div", "stat")
            let formattedStat = getPath(dataset.teams[team], stat.path)
           
            if (stat.multiplier !== undefined) {
                formattedStat *= stat.multiplier
            }

            if (stat.decimals !== undefined) {
                formattedStat = formattedStat.toFixed(stat.decimals)
            }

            if (stat.unit) {
                formattedStat += stat.unit
            }

            this.stat.innerHTML = `<strong>${statName}:</strong> ${formattedStat}`
            this.list.appendChild(this.stat)
        }
    }
}