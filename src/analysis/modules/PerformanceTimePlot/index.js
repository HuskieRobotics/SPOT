class PerformanceTimePlot {
    container;
    moduleConfig;

    constructor(moduleConfig) {
        this.moduleConfig = moduleConfig
        this.container = createDOMElement("div", "container line")
    }

    async formatData(teams, dataset) {
        let trackedStats = this.moduleConfig.options.trackedStats;
        if (teams.length > 1) throw new Error("Can't track multiple multiple teams!")
        let teamTmps = dataset.tmps.filter(x=>x.robotNumber == teams[0]);

        let trackedStatTraces = {};
        for (let stat of trackedStats) {
            trackedStatTraces[stat] = {
                name: stat,
                x: [...Array(teamTmps.length).keys()],
                y: [],
                mode: 'lines+markers'
            }
        }

        for (let tmp of teamTmps) {
            for (let stat of trackedStats) {
                trackedStatTraces[stat].y.push(getPath(tmp,stat));
            }
        }

        return Object.values(trackedStatTraces);
    }

    async setData(data) {
        const layout = {
            dragmode: false,
            autosize: true,
            margin: {
                pad: 12,
                // b: 40
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
                orientation: "h",
                itemsizing: "trace",
                y: -3
            },
            font: {
                family: "Cairo, sans-serif"
            },
            paper_bgcolor: "#FEFEFE",
            plot_bgcolor: "#FEFEFE"
        }

        const config = {
            responsive: true,
            showAxisDragHandles: false,
            modeBarButtonsToRemove: ["zoom2d", "pan2d"]
        }

        Plotly.purge(this.container)
        Plotly.newPlot(this.container, data, layout, config)
    }
}

async function getSvgDataPng(url) {
    const img = document.createElement("img");
    img.src = url;
    return new Promise((r) => {
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width * 4;
            canvas.height = img.height * 4;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img,0,0,img.width * 4, img.height * 4);
            r({src: canvas.toDataURL(), w: img.width, h: img.height});
        }
    })
  }