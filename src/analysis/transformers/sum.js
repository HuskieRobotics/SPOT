/**
 * @type {DataTransformer}
 * @param options.addends {String[]} array of MatchTeamPerformance outputPaths 
 */
__TMP__
new DataTransformer("sum", (dataset, outputPath, options) => {
    for (const tmp of dataset.tmps) {
        const summed = options.addends.reduce((acc, i) => {
            return acc + getPath(tmp, i, 0)
        }, 0)

        setPath(tmp, outputPath, summed)
    }

    return dataset;
})
__/TMP__

/**
 * @type {DataTransformer}
 * @param options.addends {String[]} array of Team outputPaths
 */
__TEAM__
new DataTransformer("sum", (dataset, outputPath, options) => {
    for (const [teamNumber, team] of Object.entries(dataset.teams)) {
        const summed = options.addends.reduce((acc, i) => {
            return acc + getPath(team, i, 0)
        }, 0)

        setPath(team, outputPath, summed)
    }

    return dataset;
})
__/TEAM__