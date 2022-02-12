const matchScoutingConfig = require("../../../config/match-scouting.json");
const { setPath, getPath } = require("../../lib/util");
const {DataTransformer} = require("../DataTransformer");

const actionIds = matchScoutingConfig.layout.layers.flat().reduce((acc,button) => acc.includes(button.id) ? acc : acc.concat(button.id), []); //get list of unique actionIds from the buttons in config.json

module.exports = {
    /**
     * @type {DataTransformer}
     * @param options.all {Boolean} if true, count all actionIds in the config
     * @param options.ids {String[]} the array of actionIds to be counted
     * @param actionArrayPath {String} optional, the path to the array of actions in the tmp
     */
    tmp: new DataTransformer("countActions",(dataset,outputPath,options) => { //options {all: Boolean, ids: String[]}
        /* find which action ids should be counted */
        if (!options) throw new Error("no options provided! Please provide an array of ids or set all to true")
        let countedIds = options.ids;
        if (options.all) { //count all action ids
            countedIds = actionIds;
        }
        let actionArrayPath = options.actionArrayPath || "actionQueue"; //by default, count actions in the action queue

        /* iterate through TeamMatchPerformances to count said action ids */
        for (let tmp of dataset.tmps) {
            let out = countedIds.reduce((acc,id) => { // construct an object of {id1: 0, id2: 0, id3: 0} at outputPath
                acc[id] = 0;
                return acc
            }, {});

            for (let action of getPath(tmp,actionArrayPath)) { //look at every action in the action queue
                if (countedIds.includes(action.id)) out[action.id]++; //increment the count of the action's id by 1 if it's supposed to be counted
            }

            setPath(tmp,outputPath,out);
        }
        return dataset;
    }),
    /**
     * @type {DataTransformer}
     * @param options.all {Boolean} if true, count all actionIds in the config
     * @param options.ids {String[]} the array of actionIds to be counted
     * @param actionArrayPath {String} optional, the path to the array of actions in the tmp
     */
    team: new DataTransformer("countActions",(dataset,outputPath,options) => {
        /* find which action ids should be counted */
        if (!options) throw new Error("no options provided! Please provide an array of ids or set all to true")
        let countedIds = options.ids;
        if (options.all) { //count all action ids
            countedIds = actionIds;
        }
        let actionArrayPath = options.actionArrayPath || "actionQueue"; //by default, count actions in the action queue
        
        /* iterate through team objects for output paths */
        for (let [teamNumber,team] of Object.entries(dataset.teams)) {
            let teamTmps = dataset.tmps.filter(x=>x.robotNumber == teamNumber); //only the tmps that are this team's
            
            let out = countedIds.reduce((acc,id) => { // construct an object of {id1: 0, id2: 0, id3: 0} at outputPath
                acc[id] = 0;
                return acc
            }, {});

            for (let tmp of teamTmps) {
                for (let action of getPath(tmp,actionArrayPath)) { //look at every action in the action queue
                    if (countedIds.includes(action.id)) out[action.id]++; //increment the count of the action's id by 1 if it's supposed to be counted
                }
            }

            setPath(team,outputPath,out);
        }
        return dataset;
    })
}