class Pie {
  container;
  moduleConfig;

  constructor(moduleConfig) {
    this.moduleConfig = moduleConfig;
    this.container = createDOMElement("div", "container pie");
    //this.container.innerHTML = '<div style = "font-size: 2em; text-align:center;">No Team Selected</div>'
  }

  getCssVar(name) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
  }

  formatData(teams, dataset) {
    let filteredTeams = teams.filter((team) => team != "|");
    const unit = this.moduleConfig.options.unit || "";
    const decimals = this.moduleConfig.options.decimals ?? 2;
    const values = this.moduleConfig.options.slices.map((slice) => {
      const summed = filteredTeams
        .map((team) => {
          let data = getPath(dataset.teams[team], slice.path);
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

    const numericValues = values.map((value) =>
      Math.max(0, Number(value) || 0),
    );

    const data = [
      {
        labels: this.moduleConfig.options.slices.map((slice) => slice.name),
        values: numericValues,
        type: "pie",
        hole: 0.4,
        textfont: {
          size: 20,
        },
        textinfo: unit ? "text" : "value",
        texttemplate: unit ? `%{value:.${decimals}f}${unit}` : undefined,
        textposition: "inside",
        sort: false,
      },
    ];

    return data;
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
        yanchor: "middle",
      },
      legend: {
        font: {
          size: 20,
        },
        x: 0.85,
      },
      font: {
        family: "Cairo, sans-serif",
        color: this.getCssVar("--text"),
      },
      paper_bgcolor: this.getCssVar("--bg-alt"),
      plot_bgcolor: this.getCssVar("--bg-alt"),
    };

    const config = {
      responsive: true,
      modeBarButtonsToRemove: ["zoom2d", "pan2d", ""],
    };

    Plotly.purge(this.container);
    Plotly.newPlot(this.container, data, layout, config);
  }
}
