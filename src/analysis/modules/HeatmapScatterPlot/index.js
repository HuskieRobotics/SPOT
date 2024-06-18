class HeatmapScatterPlot {
    container;
    moduleConfig;

    constructor(moduleConfig) {
        this.moduleConfig = moduleConfig
        this.container = createDOMElement("div", "container plot")
        this.switcher = createDOMElement("div", "switcher")
        
    }

    async formatData(teams, dataset) {
        let actionGroups = this.moduleConfig.options.actionGroups
        let actions = actionGroups.reduce((acc, action) => {
            acc.push(...action.actions)
            return acc
        }, [])

        const data = actions.reduce((acc, actionId) => {
            const filteredActionQueue = teams.map(team => getPath(dataset.teams[team], this.moduleConfig.options.aggregatedActionsPath)).flat().filter(a => a.id == actionId)
            // console.log(this.moduleConfig.options.actionLabels[actionId])
			if (filteredActionQueue.length) {
				acc.push({
					mode: "markers",
					type: "scatter",
					showlegend: true,
					name: this.moduleConfig.options.actionLabels[actionId],
					x: filteredActionQueue.map(a => getPath(a, this.moduleConfig.options.coordinatePath).x),
					y: filteredActionQueue.map(a => getPath(a, this.moduleConfig.options.coordinatePath).y),
					marker: {
						size: 16,
						line: {
							color: 'white',
							width: 1
						},
					},
					opacity: 0.6
				})
			}

			return acc
        }, [])

		// console.log(data)

        const filteredAllActionQueue = teams.map(team => getPath(dataset.teams[team], this.moduleConfig.options.aggregatedActionsPath)).flat()
            .filter(a => actionGroups[0].actions.includes(a.id))

        data.push({
            type: "histogram2dcontour",
			name: "Heatmap",
			showlegend: true,
            x: filteredAllActionQueue.map(a => getPath(a, this.moduleConfig.options.coordinatePath).x),
            y: filteredAllActionQueue.map(a => getPath(a, this.moduleConfig.options.coordinatePath).y),
            xaxis: "x",
            yaxis: "y",
            opacity: 0.7,
            nbinsx: 10,
            nbinsy: 10,
            // xbins: {
            //     start: 0,
            //     size: 5,
            //     end: 100
            // },
            // ybins: {
            //     start: 0,
            //     size: 5,
            //     end: 100
            // },
            zmin: 0,
            showscale: false,
            colorscale: [[0, "rgba(255,255,255,0)"],[.1, "rgba(255, 147, 115, 50)"],[1, "rgba(255, 59, 0, 255)"]],
        })

        return data
    }

    async setData(data) {
        const fieldImg = await getSvgDataPng(window.location.href + this.moduleConfig.options.imgPath)

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
            xaxis: {
                range: [ 0, 100 ],
                showgrid: false,
                showticklabels: false,
                zeroline: false,
                showline: false
            },
            yaxis: {
                range: [ 100, 0 ],
                showticklabels: false,
                showgrid: false,
                scaleanchor: "x",
                scaleratio: fieldImg.h / fieldImg.w,
                zeroline: false,
                showline: false
            },
            font: {
                family: "Cairo, sans-serif"
            },
            paper_bgcolor: "#FEFEFE",
            plot_bgcolor: "#FEFEFE",
            images: [
                {
                    "source": fieldImg.src,
                    "xref": "x",
                    "yref": "y",
                    "x": 0,
                    "y": 0,
                    "sizex": 100,
                    "sizey": 100,
                    "sizing": "fill",
                    "opacity": 1,
                    "layer": "below"
                }
            ]
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