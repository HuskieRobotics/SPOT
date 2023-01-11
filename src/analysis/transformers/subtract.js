const { getPath, setPath } = require("../../lib/util");
const {DataTransformer} = require("../DataTransformer");

module.exports = {
    /**
     * @type {DataTransformer}
     * @param options.minuend {String} a MatchTeamPerformance outputPath with the minuend
	 * @param options.subtrahend {String} a MatchTeamPerformance outputPath with the subtrahend
     */
    tmp: new DataTransformer("subtract", (dataset, outputPath, options) => {
        for (const tmp of dataset.tmps) {
			const difference = getPath(tmp, options.minuend, 0) - getPath(tmp, options.subtrahend, 0)

            setPath(tmp, outputPath, difference)
        }

        return dataset;
    }),

    /**
     * @param options.minuend {String} a MatchTeamPerformance outputPath with the minuend
	 * @param options.subtrahend {String} a MatchTeamPerformance outputPath with the subtrahend
     */
    team: new DataTransformer("subtract", (dataset, outputPath, options) => {
        for (const [teamNumber, team] of Object.entries(dataset.teams)) {
			const difference = getPath(team, options.minuend, 0) - getPath(team, options.subtrahend, 0)

            setPath(team, outputPath, difference)
        }

        return dataset;
    })
}