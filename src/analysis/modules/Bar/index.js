class Bar {
    container;
    moduleConfig;

    constructor(moduleConfig) {
        this.moduleConfig = moduleConfig
        this.container = createDOMElement("div", "container bar")
    }

    setData(team, dataset) {
        let bars = this.moduleConfig.options.bars
        const data = [
            {
                x: Object.keys(bars),
                y: Object.entries(bars).map((bar) => {
                    return getPath(dataset.teams[team], bar[1].path)
                }),
                type: "bar",
                marker: {
                    color: "#30a2ff"
                }
            }
        ]

        const layout = {
            margin: {
                pad: 12
            },
            title: {
                text: this.moduleConfig.name,
                font: {
                    size: 32,
                    // color: "#ff6030"    
                },
                yanchor: "middle"
            },
            xaxis: {
                tickfont: {
                    size: 20    
                }
            },
            yaxis: {
                tickfont: {
                    size: 16   
                }
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