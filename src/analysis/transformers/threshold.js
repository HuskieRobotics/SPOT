const { getPath, setPath } = require("../../lib/util");
const {DataTransformer} = require("../DataTransformer");

module.exports = {
    /** given a list of paths with numeric values, returns a list or delimited string of those paths that pass a minimum threshold
     * @type {DataTransf {ormer}
	 * @param options.threshold {Number} a number that all path values must be greater than to pass the threshold. if not specified, all values pass
	 * @param options.separator {String} a string to join each passing name with. if not specified, return an array of names
	 * @param options.none {String} a string to return if no values pass. a separator is required for this parameter to be used (optional)
     * @param options.paths {Object} an object whose keys are paths to numeric values and whose values are names to be returned if the numeric value passes the threshold
     */
    team: new DataTransformer("threshold", (dataset, outputPath, options) => {
        for (const team of Object.values(dataset.teams)) {
			const passingNames = []

			for (const [path, name] of Object.entries(options.paths)) {
				if (options.threshold === undefined || getPath(team, path, 0) > options.threshold) {
					passingNames.push(name)
				}
			}

			let result
			if (options.separator === undefined) {
				result = passingNames
			} else {
				if (passingNames.length === 0 && options.none !== "") {
					result = options.none
				} else {
					result = passingNames.join(options.separator)
				}
			}

			setPath(team, outputPath, result)
        }

        return dataset;
    })
}