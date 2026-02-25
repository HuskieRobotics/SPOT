/**
 * @type {DataTransformer}
 * @param options.multiplicands {(String|{path:String})[]} array of MatchTeamPerformance outputPaths 
 */
__TMP__
new DataTransformer("multiply", (dataset, outputPath, options) => {
    for (const tmp of dataset.tmps) {
      let product = 1;
        for (const multiplicand of options.multiplicands) {
          const multiplicandPath = typeof multiplicand === "string" ? multiplicand : multiplicand.path;
          product *= getPath(tmp, multiplicandPath, 1);
        }

        setPath(tmp, outputPath, product)
    }

    return dataset;
})
__/TMP__

/**
 * @type {DataTransformer}
 * @param options.multiplicands {(String|{path:String})[]} array of Team outputPaths
 */
__TEAM__
new DataTransformer("multiply", (dataset, outputPath, options) => {
    for (const [teamNumber, team] of Object.entries(dataset.teams)) {
        let product = 1;
        for (const multiplicand of options.multiplicands) {
          const multiplicandPath = typeof multiplicand === "string" ? multiplicand : multiplicand.path;
          product *= getPath(team, multiplicandPath, 1);
        }

        setPath(team, outputPath, product)
    }

    return dataset;
})
__/TEAM__