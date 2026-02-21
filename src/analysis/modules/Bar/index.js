class Bar {
  container;
  moduleConfig;

  constructor(moduleConfig) {
    this.moduleConfig = moduleConfig;
    this.container = createDOMElement("div", "container bar");
  }

  getCssVar(name) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
  }

  formatData(teams, dataset) {
    const values = this.moduleConfig.options.bars.map((bar) => {
      const summed = teams
        .map((team) => getPath(dataset.teams[team], bar.path, 0))
        .flat()
        .reduce((acc, i) => acc + i, 0);
      if (bar.aggrMethod == "sum") {
        //optionally summed
        return summed;
      } else {
        //default is average
        return summed / teams.length;
      }
    });

    const data = [
      {
        x: this.moduleConfig.options.bars.map((bar) => bar.name),
        y: values,
        type: "bar",
        marker: {
          color: "#30a2ff",
        },
      },
    ];

    return data;
  }

  setData(data) {
    const layout = {
      margin: {
        pad: 12,
      },
      title: {
        text: this.moduleConfig.name,
        font: {
          size: 32,
          // color: "#ff6030"
        },
        yanchor: "middle",
      },
      xaxis: {
        tickfont: {
          size: 20,
        },
      },
      yaxis: {
        tickfont: {
          size: 16,
        },
        linecolor: this.getCssVar("--text-alt"),
        gridcolor: this.getCssVar("--text-alt"),
        zerolinecolor: this.getCssVar("--text"),
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
