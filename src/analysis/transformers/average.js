const config = require("../../../config/client.json");
const { getPath, setPath } = require("../../lib/util");
const {DataTransformer} = require("../DataTransformer");

module.exports = {
    /** averages paths in TMPs and outputs as a path in team
     * @type {DataTransformer}
     * @param options.path {String} a TeamMatchPerformance outputPath
     */
    team: new DataTransformer("average", (dataset, outputPath, options) => {
        for (const [teamNumber, team] of Object.entries(dataset.teams)) {
            const teamTmps = dataset.tmps.filter(x=>x.robotNumber == teamNumber); //only the tmps that are this team's

            let average = teamTmps.reduce((acc, tmp) => {
                return acc + getPath(tmp, options.path)
            }, 0) / teamTmps.length

            setPath(team, outputPath, average)
        }

        return dataset;
    })
}