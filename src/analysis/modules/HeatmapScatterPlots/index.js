class HeatmapScatterPlots {
    container;
    moduleConfig;

    constructor(moduleConfig) {
        this.moduleConfig = moduleConfig
        this.container = createDOMElement("div", "container plot")
        this.switcher = createDOMElement("div", "switcher")
        this.heatmapSwitch = createDOMElement("button", "switcher-button")
        this.heatmapSwitch.innerText = "Heatmap"
        this.scatterSwitch = createDOMElement("button", "switcher-button")
        this.scatterSwitch.innerText = "Scatter"
        this.switcher.appendChild(this.heatmapSwitch)
        this.switcher.appendChild(this.scatterSwitch)
    }

    setData(team, dataset) {
        let actionGroups = this.moduleConfig.options.actionGroups
        let actions = actionGroups.reduce((acc, action) => {
            acc.push(...action.actions)
            return acc
        }, [])
        const data = actions.map(actionId => {
            let filteredActionQueue = getPath(dataset.teams[team], this.moduleConfig.options.aggregatedActionsPath).filter(a => a.id == actionId)
            return {
                mode: "markers",
                type: "scatter",
                name: this.moduleConfig.options.actionLabels[actionId],
                x: filteredActionQueue.map(a => getPath(a, this.moduleConfig.options.coordinatePath).x),
                y: filteredActionQueue.map(a => getPath(a, this.moduleConfig.options.coordinatePath).y)
            }
        })

        const layout = {
            margin: {
                pad: 12,
                b: 30,
            },
            title: {
                text: this.moduleConfig.name,
                font: {
                    size: 32,
                    // color: "#ff6030"    
                },
                yanchor: "middle"
            },
            legend: {
                font: {
                    size: 20    
                },
                x: 0.85
            },
            font: {
                family: "Cairo, sans-serif"
            },
            paper_bgcolor: "#FEFEFE",
            plot_bgfcolor: "#FEFEFE",
        }

        const config = {
            responsive: true,
            modeBarButtonsToRemove: ["zoom2d", "pan2d"]
        }

        Plotly.react(this.container, data, layout, config)
    }
}