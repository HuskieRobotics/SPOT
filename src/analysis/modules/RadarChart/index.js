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
    const lines = filteredTeams.map((team) => {
      const data = [];
      const sectionNames = [];
      for (let i = 0; i < this.moduleConfig.options.sections.length; i++) {
        sectionNames.push(this.moduleConfig.options.sections[i].name);
      }

      for (let i = 0; i < this.moduleConfig.options.lines.length; i++) {
        let values = [];
        for (
          let j = 0;
          j < this.moduleConfig.options.lines[i].times.length;
          j++
        ) {
          let point = null;
          if (!(this.moduleConfig.options.lines[i].times[j].path == "none")) {
            point = getPath(
              dataset.teams[team],
              this.moduleConfig.options.lines[i].times[j].path,
            );
          }
          values.push(point);
        }
        const line = {
          type: "scatterpolar",
          r: values,
          theta: sectionNames,
          fill: "toself",
          name: this.moduleConfig.options.lines[i].name,
          connectgaps: true,
        };
        data.push(line);
      }
      return data;
    });

    return lines.flat();
  }

  setData(data) {
    const layout = {
      polar: {
        radialaxis: {
          visible: true,
          range: [0, 4],
          tickfont: {
            family: "Cairo, sans-serif",
            size: 16,
          },
          angle: 90,
        },
        angularaxis: {
          tickfont: {
            size: 16,
            family: "Cairo, sans-serif",
          },
          direction: "clockwise",
          rotation: 90,
        },
      },
      margin: {
        pad: 12,
        b: 30,
      },
      title: {
        text: this.moduleConfig.name,
        font: {
          size: 32,
        },
        yanchor: "middle",
      },
      legend: {
        font: {
          size: 18,
        },
        x: 0.85,
      },
      font: {
        family: "Cairo, sans-serif",
      },
      paper_bgcolor: "#FEFEFE",
      plot_bgcolor: "#FEFEFE",
    };

    const config = {
      responsive: true,
    };

    Plotly.purge(this.container);
    Plotly.newPlot(this.container, data, layout, config);
  }
}
