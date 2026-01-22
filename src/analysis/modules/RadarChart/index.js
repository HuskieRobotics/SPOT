class RadarChart {
  container;
  moduleConfig;

  constructor(moduleConfig) {
    this.moduleConfig = moduleConfig;
    this.container = createDOMElement("div", "container radar");
    //this.container.innerHTML = '<div style = "font-size: 2em; text-align:center;">No Team Selected</div>'
  }

  formatData(teams, dataset) {
    console.log(`radar teams recieved: ${teams}`);
    let filteredTeams = teams.filter((team) => team != "|");
    // const values = this.moduleConfig.options.slices.map((slice) => {
    //   const summed = filteredTeams
    //     .map((team) => {
    //       let data = getPath(dataset.teams[team], slice.path);
    //       console.log(`${slice.path}: ${data}`);
    //       return data;
    //     })
    //     .flat()
    //     .reduce((acc, i) => acc + i, 0);
    //   if (slice.aggrMethod == "sum") {
    //     //optionally summed
    //     return summed;
    //   } else {
    //     //default is average
    //     return (summed / teams.length).toFixed(2);
    //   }
    // });

    const data = [
      // {
      //   labels: this.moduleConfig.options.slices.map((slice) => slice.name),
      //   values: values.map((value) => Math.max(0, value)),
      //   type: "pie",
      //   hole: 0.4,
      //   textfont: {
      //     size: 20,
      //   },
      //   textinfo: "value",
      //   textposition: "inside",
      // },

      // EXAMPLE DATA
      {
        type: "scatterpolar",
        r: [39, 28, 8, 7, 28, 39],
        theta: ["A", "B", "C", "D", "E", "A"],
        fill: "toself",
        name: "Group A",
      },
      {
        type: "scatterpolar",
        r: [1.5, 10, 39, 31, 15, 1.5],
        theta: ["A", "B", "C", "D", "E", "A"],
        fill: "toself",
        name: "Group B",
      },
    ];

    return data;
  }

  setData(data) {
    // const layout = {
    //   margin: {
    //     pad: 12,
    //     b: 30,
    //   },
    //   title: {
    //     text: this.moduleConfig.name,
    //     font: {
    //       size: 32,
    //       // color: "#ff6030"
    //     },
    //     yanchor: "middle",
    //   },
    //   legend: {
    //     font: {
    //       size: 20,
    //     },
    //     x: 0.85,
    //   },
    //   font: {
    //     family: "Cairo, sans-serif",
    //   },
    //   paper_bgcolor: "#FEFEFE",
    //   plot_bgfcolor: "#FEFEFE",
    // };

    // const config = {
    //   responsive: true,
    //   modeBarButtonsToRemove: ["zoom2d", "pan2d", ""],
    // };

    // Plotly.purge(this.container);
    // Plotly.newPlot(this.container, data, layout, config);

    //EXAMPLE CODE
    const layout = {
      polar: {
        radialaxis: {
          visible: true,
          range: [0, 50],
        },
      },
    };

    Plotly.newPlot(this.container, data, layout);
  }
}
