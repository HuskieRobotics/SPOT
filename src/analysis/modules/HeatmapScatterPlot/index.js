class HeatmapScatterPlot {
  container;
  moduleConfig;

  constructor(moduleConfig) {
    this.moduleConfig = moduleConfig;
    this.container = createDOMElement("div", "container plot");
    this.switcher = createDOMElement("div", "switcher");
  }

  getCssVar(name) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
  }

  async formatData(teams, dataset) {
    let actionGroups = this.moduleConfig.options.actionGroups;
    let actions = actionGroups.reduce((acc, action) => {
      acc.push(...action.actions);
      return acc;
    }, []);

    // helper to map action -> transformed coordinate (or null if out-of-scope)
    const transformPoint = (a) => {
      const coord = getPath(a, this.moduleConfig.options.coordinatePath, null);
      if (!coord || typeof coord.x !== "number" || typeof coord.y !== "number")
        return null;

      const xRaw = coord.x;
      const yRaw = coord.y;

      if (xRaw > 69.5) {
        return { x: (100 - xRaw) * 2, y: 100 - yRaw };
      } else if (xRaw < 30.5) {
        return { x: xRaw * 2, y: yRaw };
      }
      return null;
    };

    const data = actions.reduce((acc, actionId) => {
      const filteredActionQueue = teams
        .map((team) =>
          getPath(
            dataset.teams[team],
            this.moduleConfig.options.aggregatedActionsPath,
          ),
        )
        .flat()
        .filter((a) => a.id == actionId);

      // produce paired coordinates and drop nulls
      const pts = filteredActionQueue.map(transformPoint).filter(Boolean);

      if (pts.length) {
        acc.push({
          mode: "markers",
          type: "scatter",
          showlegend: true,
          name: this.moduleConfig.options.actionLabels[actionId],
          x: pts.map((p) => p.x),
          y: pts.map((p) => p.y),
          marker: {
            size: 13,
            line: {
              color: "white",
              width: 1,
            },
          },
          opacity: 0.6,
        });
      }

      return acc;
    }, []);

    // build heatmap data using the same transform and explicit bins (consistent with image 0-100)
    const filteredAllActionQueue = teams
      .map((team) =>
        getPath(
          dataset.teams[team],
          this.moduleConfig.options.aggregatedActionsPath,
        ),
      )
      .flat()
      .filter((a) => actionGroups[0].actions.includes(a.id));

    const heatPts = filteredAllActionQueue.map(transformPoint).filter(Boolean);

    data.push({
      type: "histogram2dcontour",
      name: "Heatmap",
      showlegend: true,
      x: heatPts.map((p) => p.x),
      y: heatPts.map((p) => p.y),
      xaxis: "x",
      yaxis: "y",
      opacity: 0.7,
      // explicit bins so the heatmap doesn't rescale based on data extent
      nbinsx: undefined,
      nbinsy: undefined,
      xbins: { start: 0, end: 100, size: 8 },
      ybins: { start: 0, end: 100, size: 8 },
      zmin: 0,
      showscale: false,
      colorscale: [
        [0, "rgba(255,255,255,0)"],
        [0.1, "rgba(255, 147, 115, 50)"],
        [1, "rgba(255, 59, 0, 255)"],
      ],
    });

    return data;
  }

  async setData(data) {
    const fieldImg = await getSvgDataPng(
      "/" + this.moduleConfig.options.imgPath,
    );

    const layout = {
      dragmode: false,
      autosize: true,
      margin: {
        pad: 12,
        // b: 40
      },
      height: 500,
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
        orientation: "h",
        itemsizing: "trace",
        y: -3,
      },
      xaxis: {
        range: [0, 100],
        showgrid: false,
        showticklabels: false,
        zeroline: false,
        showline: false,
      },
      yaxis: {
        range: [100, 0],
        showticklabels: false,
        showgrid: false,
        scaleanchor: "x",
        scaleratio: fieldImg.h / fieldImg.w,
        zeroline: false,
        showline: false,
      },
      font: {
        family: "Cairo, sans-serif",
        color: this.getCssVar("--text"),
      },
      paper_bgcolor: this.getCssVar("--bg-alt"),
      plot_bgcolor: this.getCssVar("--bg-alt"),
      images: [
        {
          source: fieldImg.src,
          xref: "x",
          yref: "y",
          x: 0,
          y: 0,
          sizex: 100,
          sizey: 100,
          sizing: "fill",
          opacity: 1,
          layer: "below",
        },
      ],
    };

    const config = {
      responsive: true,
      showAxisDragHandles: false,
      modeBarButtonsToRemove: ["zoom2d", "pan2d"],
    };

    Plotly.purge(this.container);
    Plotly.newPlot(this.container, data, layout, config);
  }
}

async function getSvgDataPng(url) {
  const img = document.createElement("img");
  img.src = url;
  return new Promise((r) => {
    img.onload = () => {
      // use natural size and devicePixelRatio for consistent aspect and crispness
      const scale = window.devicePixelRatio || 1;
      const naturalW = img.naturalWidth || img.width;
      const naturalH = img.naturalHeight || img.height;

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(naturalW * scale);
      canvas.height = Math.round(naturalH * scale);
      const ctx = canvas.getContext("2d");
      // scale context so returned image is crisp on high-DPI displays
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.drawImage(img, 0, 0, naturalW, naturalH);
      r({ src: canvas.toDataURL(), w: naturalW, h: naturalH });
    };
    img.onerror = () => r({ src: "", w: 1, h: 1 });
  });
}
