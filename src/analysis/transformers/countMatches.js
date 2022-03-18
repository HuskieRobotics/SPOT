const { setPath } = require("../../lib/util");
const {DataTransformer} = require("../DataTransformer");

module.exports = {
    /**
     * @type {DataTransformer}
     * @param options.weight {Number} a scalar multiplicative factor the multiply the matches by (eg. for counting total time)
     */
    team: new DataTransformer("countMatches", (dataset, outputPath, options) => {
        for (let [teamNumber,team] of Object.entries(dataset.teams)) {
            let matches = new Set(dataset.tmps //use a set to avoid duplicates
                .filter(x=>x.robotNumber == teamNumber) //only the tmps that are this team's
                .map(x=>x.matchNumber)).size; //dont count duplicate matches
            setPath(team,outputPath,matches*(options.weight || 1));
        }

        return dataset;
    })
}