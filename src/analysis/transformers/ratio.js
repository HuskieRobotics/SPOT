const config = require("../../../config/client.json");
const { getPath, setPath } = require("../../lib/util");
const {DataTransformer,Dataset} = require("../DataTransformer");

module.exports = {
    /**
     * @type {DataTransformer}
     * @param options.numerator {Array} array of TeamMatchPerformance output paths summed to become numerator of the ratio
     * @param options.denominator {Array} array of TeamMatchPerformance output paths summed to become denominator of the ratio
     * @param options.divByZero {Object} value to return if denominator sum is zero
     */
    tmp: new DataTransformer("ratio",(dataset,outputPath,options) => {

        /* iterate through TeamMatchPerformances */
        for (let tmp of dataset.tmps) {
            const denominatorSum = options.denominator.reduce((acc, path) => {
                acc += getPath(tmp, path, 0)
                return acc
            }, 0)

            const numeratorSum = options.numerator.reduce((acc, path) => {
                acc += getPath(tmp, path, 0)
                return acc
            }, 0)

            if (denominatorSum === 0) {
                setPath(tmp, outputPath, options.divByZero || Infinity)
            } else {
                setPath(tmp, outputPath, numeratorSum / denominatorSum)
            }
        }

        return dataset;
    }),
    team: new DataTransformer("ratio", (dataset,outputPath,options) => {
        /* iterate through TeamMatchPerformances */
        for (let [teamNumber, team] of Object.entries(dataset.teams)) {
            const denominatorSum = options.denominator.reduce((acc, path) => {
                acc += getPath(team, path, 0)
                return acc
            }, 0)

            const numeratorSum = options.numerator.reduce((acc, path) => {
                acc += getPath(team, path, 0)
                return acc
            }, 0)

            if (denominatorSum === 0) {
                setPath(team, outputPath, options.divByZero || Infinity)
            } else {
                setPath(team, outputPath, numeratorSum / denominatorSum)
            }
        }

        return dataset;
    })
}