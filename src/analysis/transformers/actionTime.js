const { setPath, getPath } = require("../../lib/util");
const {DataTransformer} = require("../DataTransformer");

module.exports = {
    /**
     * find the first time an action occurs in the action queue of a tmp and outputs it to a field
     * @type {DataTransformer}
     * @param options.actionId {String} the actionId of the action to find the time of.
     * @param options.default {Object} the default value (if it didn't occur)
     */
    tmp: new DataTransformer("actionTime", (dataset, outputPath, options) => {
        for (let tmp of dataset.tmps) {
            for (let action of tmp.actionQueue) {
                if (action.id == options.actionId) {
                    setPath(tmp, outputPath, action.ts);
                }
            }
            if (!getPath(tmp,outputPath,false)) //no action of options.actionId found
                setPath(tmp,outputPath,options.default || null);
        }
        return dataset;

    })
}