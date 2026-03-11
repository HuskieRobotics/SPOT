/**
 * @type {DataTransformer}
 * @param options.multiplicands {(String|{path:String})[]} array of MatchTeamPerformance outputPaths 
 * @param options.weight {Number} additional multiplier applied to the product
 */
__TMP__
new DataTransformer("multiply", (dataset, outputPath, options) => {
    for (const tmp of dataset.tmps) {
      let product = 1;
        for (const multiplicand of options.multiplicands) {
          const multiplicandPath = typeof multiplicand === "string" ? multiplicand : multiplicand.path;
          product *= getPath(tmp, multiplicandPath, 1);
        }
        product *= options.weight;

        setPath(tmp, outputPath, product)
    }

    return dataset;
})
__/TMP__

/**
 * @type {DataTransformer}
 * @param options.multiplicands {(String|{path:String})[]} array of Team outputPaths
 * @param options.weight {Number} additional multiplier applied to the product
 */
__TEAM__
new DataTransformer("multiply", (dataset, outputPath, options) => {
    for (const [teamNumber, team] of Object.entries(dataset.teams)) {
        let product = 1;
        for (const multiplicand of options.multiplicands) {
          const multiplicandPath = typeof multiplicand === "string" ? multiplicand : multiplicand.path;
          product *= getPath(team, multiplicandPath, 1);
        }
        product *= options.weight;

        setPath(team, outputPath, product)
    }

    return dataset;
})
__/TEAM__