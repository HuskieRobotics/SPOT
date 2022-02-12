const { getPath, setPath } = require("../../lib/util");
const {DataTransformer} = require("../DataTransformer");

module.exports = {
    /** takes the average of a field in an array
     * @type {DataTransformer}
     * @param options.arrayPath {String} the path at which the arrays to concatenate exist
     * @param options.valuePath {String} the path to the field to be averaged
     */
    tmps: new DataTransformer("averageArray", (dataset, outputPath, options) => {
        for (let tmp of dataset.tmps) {
            let array = getPath(tmp,options.arrayPath);
            if (!Array.isArray(array)) throw new Error(`no array found at ${options.arrayPath}!`);
            
            let avg = array.reduce((acc,x) => acc + getPath(x, options.valuePath), 0) / array.length;
            setPath(tmp, outputPath, avg);
        }
    }),
    /** takes the average of a field in an array
     * @type {DataTransformer}
     * @param options.arrayPath {String} the path at which the arrays to concatenate exist
     * @param options.valuePath {String} the path to the field to be averaged
     */
    team: new DataTransformer("averageArray", (dataset, outputPath, options) => {
        for (let [teamNumber,team] of Object.entries(dataset.teams)) {
            let array = getPath(team,options.arrayPath);
            if (!Array.isArray(array)) throw new Error(`no array found at ${options.arrayPath}!`);

            let avg = array.reduce((acc, x) => acc + getPath(x, options.valuePath), 0) / array.length;
            setPath(team,outputPath,avg)
        }
        return dataset;
    })
}