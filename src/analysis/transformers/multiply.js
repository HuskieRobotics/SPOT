/**
 * @type {DataTransformer}
 * @param options.multiplicands {aggregateArray[]} array of MatchTeamPerformance outputPaths 
 */
__TMP__
new DataTransformer("multiply", (dataset, outputPath, options) => {
    for (const tmp of dataset.tmps) {
      const product = 1;
        for (const i of options.multiplicands) {
          product *= getPath(tmp, i, 1);
        }

        setPath(tmp, outputPath, product)
    }

    return dataset;
})
__/TMP__

/**
 * @type {DataTransformer}
 * @param options.multiplicands {aggregateArray[]} array of Team outputPaths
 */
__TEAM__
new DataTransformer("multiply", (dataset, outputPath, options) => {
    for (const [teamNumber, team] of Object.entries(dataset.teams)) {
        const product = 1;
        for (const i of options.multiplicands) {
          product *= getPath(team, i, 1);
        }

        setPath(team, outputPath, product)
    }

    return dataset;
})
__/TEAM__