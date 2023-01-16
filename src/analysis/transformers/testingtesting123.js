const { getPath, setPath } = require("../../lib/util");
const {DataTransformer} = require("../DataTransformer");

module.exports = {
    /**
     * @type {DataTransformer}
     * @param options.addends {String[]} array of MatchTeamPerformance outputPaths 
     */
    tmp: new DataTransformer("test", (dataset, outputPath, options) => {
        for (const tmp of dataset.tmps) {
            // console.log(tmp)
        }

        return dataset;
    }),

    /**
     * @type {DataTransformer}
     * @param options.addends {String[]} array of Team outputPaths
     */
    team: new DataTransformer("test", (dataset, outputPath, options) => {
        for (const [teamNumber, team] of Object.entries(dataset.teams)) {
            // console.log(team)
        }

        return dataset;
    })
}