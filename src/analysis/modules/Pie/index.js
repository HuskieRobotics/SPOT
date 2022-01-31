class Pie {
    container;
    moduleConfig;

    constructor(moduleConfig) {
        this.moduleConfig = moduleConfig
        this.container = createDOMElement("div", "container pie")
    }

    setData(team, dataset) {
        let slices = this.moduleConfig.options.slices
        const data = [
            {
                labels: Object.keys(slices),
                values: Object.entries(slices).map((slice) => {
                    return getPath(dataset.teams[team], slice[1].path)
                }),
                type: "pie",
                hole: 0.4,
                textfont: {
                    size: 20
                },
                textinfo: "value",
                textposition: 'inside'

            }
        ]

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
            modeBarButtonsToRemove: ["zoom2d", "pan2d", ""]
        }

        Plotly.react(this.container, data, layout, config)
    }
}