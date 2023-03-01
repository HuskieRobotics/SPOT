const matchScoutingConfig = require("../../../config/match-scouting.json");
const { setPath, getPath } = require("../../lib/util");
const {DataTransformer} = require("../DataTransformer");

const actionIds = matchScoutingConfig.layout.layers.flat().reduce((acc,button) => acc.includes(button.id) ? acc : acc.concat(button.id), []); //get list of unique actionIds from the buttons in config.json

module.exports = {
    /**
     * output the last occurance of an action with an id in the ids list
     * @type {DataTransformer}
     * @param options.ids {String[]} the array of actionIds to be 
     * @param options.default {Object} a default object if a final action occurance isnt found
     * @param options.actionArrayPath {String} optional, the path to the array of actions in the tmp
     */
    tmp: new DataTransformer("finalActionOccurence",(dataset,outputPath,options) => {
        /* find which action ids should be examined */
        if (!options) throw new Error("no options provided! Please provide an array of ids or set all to true")
        let countedIds = options.ids;
        let actionArrayPath = options.actionArrayPath || "actionQueue"; //by default, count actions in the action queue

        for (let tmp of dataset.tmps) {
            for (let action of getPath(tmp,actionArrayPath).reverse()) { //look at every action in the action array backwards
                if (countedIds.includes(action.id)) {
                    setPath(tmp,outputPath,action);
                    break;
                }
            }
            if (!getPath(tmp,outputPath,false) && options.default) { //default object
                setPath(tmp,outputPath,options.default);
            }
        }
        return dataset;
    })
}