class RadarChart {
  container;
  moduleConfig;

  constructor(moduleConfig) {
    this.moduleConfig = moduleConfig;
    this.container = createDOMElement("div", "container radar");
    //this.container.innerHTML ='<div style = "font-size: 2em; text-align:center;">No Team Selected</div>';
  }

  formatData(teams, dataset) {
    console.log(`radar teams recieved: ${teams}`);
    let filteredTeams = teams.filter((team) => team != "|");
    // previous code start
    const values = this.moduleConfig.options.sections.map((section) => {
      const summed = filteredTeams
        .map((team) => {
          let data = getPath(dataset.teams[team], slice.path);
          console.log(`${slice.path}: ${data}`);
          return data;
        })
        .flat()
        .reduce((acc, i) => acc + i, 0);
      if (slice.aggrMethod == "sum") {
        //optionally summed
        return summed;
      } else {
        //default is average
        return (summed / teams.length).toFixed(2);
      }
    });
    //previous code end

    const data = [];

    for (let i = 0; i < this.moduleConfig.options.sections.length; i++) {
      let values = [];
      for (
        let j = 0;
        j < this.moduleConfig.options.lines[i].times.length;
        j++
      ) {
        let point = getPath(
          dataset.teams[team],
          this.moduleConfig.options.lines[i].times[j].path,
        );
        values.push(point);
      }
      const line = {
        type: "scatterpolar",
        r: values,
        theta: this.moduleConfig.options.sections[i].name,
        fill: "toself",
        name: this.moduleConfig.options.lines[i].name,
      };
      data.push(line);
    }

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

    Plotly.purge(this.container);
    Plotly.newPlot(this.container, data, layout);
  }
}
