class Stats {
  container;
  header;
  list;
  moduleConfig;
  autoStats;
  hasValue;

  // There is probably a function that doesn't change anything if if can't find the object
  // Find that function and set the stats box to only say "NA"
  constructor(moduleConfig) {
    this.moduleConfig = moduleConfig;
    this.container = createDOMElement("div", "container stats");
    this.header = createDOMElement("div", "header");
    this.list = createDOMElement("div", "list");
    this.container.appendChild(this.header);
    this.container.appendChild(this.list);
    this.header.innerHTML = "<div>No Team Selected</div>";
  }

  formatData(teams, dataset) {
    const data = [];
    for (const stat of this.moduleConfig.options.list) {
      let hasValue = true; // if each individual stat has a value
      let formattedStat;
      let summed;
      if (teams.length > 1) {
        summed = teams
          .map((team) => getPath(dataset.teams[team], stat.path, 0))
          .flat()
          .reduce((acc, i) => acc + i, 0);
      } else {
        summed = getPath(dataset.teams[teams[0]], stat.path, 0);
      }

      if (stat.aggrMethod == "sum") {
        //optionally summed
        formattedStat = summed;
      } else {
        //default is average
        formattedStat = summed / teams.length;
      }

      formattedStat = this.applyModifiers(stat, formattedStat);

      let statRank;
      let totalRanked;
      if (isNaN(formattedStat) || formattedStat == stat.hideIfValue) {
        formattedStat = "—";
        hasValue = false;
      } else {
        if (stat.sort !== 0 && stat.sort !== undefined && teams.length == 1) {
          const filteredTeams = Object.keys(dataset.teams).filter((team) => {
            let teamStatToFilter = getPath(dataset.teams[team], stat.path, 0);
            teamStatToFilter = this.applyModifiers(stat, teamStatToFilter);

            return (
              !isNaN(teamStatToFilter) && teamStatToFilter != stat.hideIfValue
            );
          });

          totalRanked = filteredTeams.length;
          const rankedTeams = filteredTeams.sort(
            (a, b) =>
              (this.applyModifiers(
                stat,
                getPath(dataset.teams[b], stat.path, 0)
              ) -
                this.applyModifiers(
                  stat,
                  getPath(dataset.teams[a], stat.path, 0)
                )) *
              stat.sort
          );
          statRank = rankedTeams.indexOf(teams[0]) + 1;
          // console.log(stat.name)
          // console.log(rankedTeams.map(t => `${t}: ${this.applyModifiers(stat, getPath(dataset.teams[t], stat.path, 0))}`))
        }

        if (stat.decimals !== undefined) {
          formattedStat = formattedStat.toFixed(stat.decimals);
        }

        if (stat.unit) {
          formattedStat += stat.unit;
        }
      }

      data.push({
        name: stat.name,
        value: formattedStat,
        rank: statRank,
        totalRanked: totalRanked,
        hasValue: hasValue,
      });
    }

    return data;
  }

  applyModifiers(stat, value) {
    if (stat.multiplier !== undefined) {
      value *= stat.multiplier;
    }

    if (stat.addend !== undefined) {
      value += stat.addend;
    }

    return value;
  }

  setData(data) {
    this.header.innerHTML = this.moduleConfig.name;

    clearDiv(this.list);

    for (const stat of data) {
      // add all data to stats div
      if (stat.hasValue == false) {
        // if no stats exist, display "No Data"
        const NAElement = createDOMElement("div", "stat");
        NAElement.innerHTML = `<strong>${stat.name}:</strong> <strong class = "noData">No Data</strong>`;
        this.list.appendChild(NAElement);
      } else {
        const statElement = createDOMElement("div", "stat"); // different rank classes display different colors
        let rankClass = "top100";
        if (stat.rank <= Math.round(stat.totalRanked * 0.05)) {
          rankClass = "top5";
        } else if (stat.rank <= Math.round(stat.totalRanked * 0.25)) {
          rankClass = "top25";
        } else if (stat.rank <= Math.round(stat.totalRanked * 0.5)) {
          rankClass = "top50";
        }

        const rank = stat.rank
          ? `<span class="rank ${rankClass}">#${stat.rank} </span>`
          : ""; // create individual stat display
        statElement.innerHTML = `<strong>${rank}${stat.name}:</strong> ${stat.value}`;
        this.list.appendChild(statElement);
      }
    }
  }
}
