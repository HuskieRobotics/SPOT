const { setPath, getPath } = require("../../lib/util");
const {DataTransformer} = require("../DataTransformer");
const matchScoutingConfig = require("../../../config/match-scouting.json");

module.exports = {
    /**
     * filter an array of actions (eg. actionQueue) by time and output the filtered array
     * @type {DataTransformer}
     * @param options.timeMin {Number} the minimum remaining time of returned actions
     * @param options.timeMax {Number} the maximum remaining time of the returned actions
     */
    tmp: new DataTransformer("actionTimeFilter", (dataset, outputPath, options) => {
        let [timeMin, timeMax] = [options.timeMin || 0, options.timeMax || matchScoutingConfig.timing.totalTime];

        for (let tmp of dataset.tmps) {
            let filteredActionArray = [];
            for (let action of tmp.actionQueue) {
                if (action.ts >= timeMin && action.ts <= timeMax) {
                    filteredActionArray.push(action);
                }
            }
            setPath(tmp,outputPath,filteredActionArray);

            if (!getPath(tmp,outputPath)) //no action of options.actionId found
                setPath(tmp,outputPath,options.default || null);
        }
        return dataset;
    })
}