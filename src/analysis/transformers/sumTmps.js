/**
 * @type {DataTransformer}
 * @param options.path {String} tmp outputPath to sum per team
 */
__TEAM__
new DataTransformer("sumTmps", (dataset, outputPath, options) => {
    for (const [teamNumber, team] of Object.entries(dataset.teams)) {
        const teamTmps = dataset.tmps.filter(x=>x.robotNumber == teamNumber);
        const summed = teamTmps.reduce((acc, tmp) => {
            return acc + getPath(tmp, options.path, 0);
        }, 0);

        setPath(team, outputPath, summed);
    }

    return dataset;
})
__/TEAM__
