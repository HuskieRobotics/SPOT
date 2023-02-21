class Pie {
    container;
    moduleConfig;

    constructor(moduleConfig) {
        this.moduleConfig = moduleConfig
        this.container = createDOMElement("div", "container pie")
    }

    formatData(teams, dataset) {
        console.log(`pie teams recieved: ${teams}`);
        let filteredTeams = teams.filter(team=>team!="|");
        const values = this.moduleConfig.options.slices.map((slice) => {
            const summed = filteredTeams.map(team => {let data = getPath(dataset.teams[team], slice.path); console.log(`${slice.path}: ${data}`);return data}).flat().reduce((acc, i) => acc + i, 0)
            if (slice.aggrMethod == "sum") { //optionally summed
                return summed
            } else { //default is average
                return (summed / teams.length).toFixed(2)
            }
        })

        const data = [
            {
                labels: this.moduleConfig.options.slices.map(slice => slice.name),
                values: values.map(value => Math.max(0, value)),
                type: "pie",
                hole: 0.4,
                textfont: {
                    size: 20
                },
                textinfo: "value",
                textposition: 'inside'

            }
        ]


        return data
    }

    setData(data) {
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

        Plotly.purge(this.container)
        Plotly.newPlot(this.container, data, layout, config)
    }
}