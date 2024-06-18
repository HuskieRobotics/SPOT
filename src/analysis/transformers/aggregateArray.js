/** concatenates arrays within tmps into a big array per team
 * @type {DataTransformer}
 * @param options.path {String} the path at which the arrays to concatenate exist
 */
__TEAM__
new DataTransformer("aggregateArray", (dataset, outputPath, options) => {
    for (let [teamNumber,team] of Object.entries(dataset.teams)) {
        let teamTmps = dataset.tmps.filter(x=>x.robotNumber == teamNumber); //only the tmps that are this team's
        setPath(team,outputPath,[]);

        for (let tmp of teamTmps) {
            let aggregateArray = getPath(team,outputPath).concat(getPath(tmp,options.path));
            setPath(team,outputPath,aggregateArray)
        }
    }
    return dataset;
})
__/TEAM__