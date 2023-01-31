const { getPath, setPath } = require("../../lib/util");
const {DataTransformer} = require("../DataTransformer");

module.exports = {
    /**
     * map a key at path (eg. "climb1") to a value (eg. 4)
     * @type {DataTransformer}
     * @param options.path {String} the path to which the key is found
     * @param options.map {Object} an Object that contains the keys and values. If the path to the 
     */
    tmp: new DataTransformer("map", (dataset, outputPath, options) => {
        for (let tmp of dataset.tmps) {
            setPath(tmp, outputPath, options.map[getPath(tmp, options.path,"")]) //default to an empty string if there is no value
        }
        return dataset;
    }),
}