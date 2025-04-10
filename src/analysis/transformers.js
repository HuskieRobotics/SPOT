const axios = require("axios");
const { DataTransformer } = require("./public/js/DataTransformer.js");
const { getPath } = require("./public/js/util.js");
const { setPath } = require("./public/js/util.js");

async function getTransformers() {
    const matchScoutingConfig = await axios.get("http://localhost:8080/config/match-scouting.json").then((res) => res.data);
    const actionIds = matchScoutingConfig.layout.layers.flat().reduce((acc,button) => acc.includes(button.id) ? acc : acc.concat(button.id), []); //get list of unique actionIds from the buttons in config.json

    return {
        
tmp: {
actionTime: new DataTransformer("actionTime", (dataset, outputPath, options) => {
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
}),
actionTimeFilter: new DataTransformer("actionTimeFilter", (dataset, outputPath, options) => {
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
}),
averageArray: new DataTransformer("averageArray", (dataset, outputPath, options) => {
    for (let tmp of dataset.tmps) {
        let array = getPath(tmp,options.arrayPath);
        if (!Array.isArray(array)) throw new Error(`no array found at ${options.arrayPath}!`);
        
        let avg = array.reduce((acc,x) => acc + getPath(x, options.valuePath), 0) / array.length;
        setPath(tmp, outputPath, avg);
    }
}),
countActions: new DataTransformer("countActions",(dataset,outputPath,options) => { //options {all: Boolean, ids: String[]}
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
countHybrid: new DataTransformer("countHybrid", (dataset, outputPath, options) => {
  var actionArrayPath = options.actionArrayPath || "actionQueue"
  for(let tmp of dataset.tmps){
    var heldPiece = "";
    var placements= {}
    for(let id of options.pickup){
      placements[id] = 0;
    }
    for(let action of getPath(tmp,actionArrayPath)){
      if(options.pickup.includes(action.id)){
        heldPiece = action.id
      }
      if(options.hybrid.includes(action.id)){
        placements[heldPiece] = placements[heldPiece] +1;
      }
    }
    setPath(tmp,outputPath,placements);
  }  
  return dataset;
}),
cycle: new DataTransformer("cycle", (dataset, outputPath, options) => {
    for (let tmp of dataset.tmps) {
        let out = {
            all: [],
            allComplete: null,
            averageTime: null,
            averageTimeComplete: null,
            cycleCount: null,
            cycleCountComplete: null
        }

        options = Object.assign({
            pickups: [],
            scores: [],
            misses: []
        },options)

        let pickups = tmp.actionQueue.filter(x=>options.pickups.includes(x.id));
        let endings = tmp.actionQueue.filter(x=>options.scores.includes(x.id) || options.misses.includes(x.id));

        while (pickups.length > 0) {
            
            let pickup = pickups.shift();

            endings = endings.filter(x=>x.ts < pickup.ts) //ensure the ends attributed to a pickup occur after the pickup
            if (endings.length === 0) break //no cycles can be completed without a ending

            let ending = endings.shift();

            out.all.push({
                pickup,
                ending,
                timeDifferential: pickup.ts - ending.ts
            })
        }
        out.averageTime = out.all.reduce((acc,x) => acc+x.timeDifferential, 0) / out.all.length;
        
        //exclude misses
        out.allComplete = out.all.filter(x=>!options.misses.includes(x.ending.id));
        out.averageTimeComplete = out.allComplete.reduce((acc,x) => acc+x.timeDifferential, 0) / out.allComplete.length;

        //counts
        out.cycleCount = out.all.length;
        out.cycleCountComplete = out.allComplete.length;
        
        setPath(tmp,outputPath,out);
    }

    return dataset;
}),
finalActionOccurrence: new DataTransformer("finalActionOccurrence",(dataset,outputPath,options) => {
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
}),
map: new DataTransformer("map", (dataset, outputPath, options) => {
    for (let tmp of dataset.tmps) {
        setPath(tmp, outputPath, options.map[getPath(tmp, options.path,"")]) //default to an empty string if there is no value
    }
    return dataset;
}),
ratio: new DataTransformer("ratio", (dataset,outputPath,options) => {

    /* iterate through TeamMatchPerformances */
    for (let tmp of dataset.tmps) {
        const denominatorSum = options.denominator.reduce((acc, path) => {
            if (typeof path == "number") {
                return acc + path
            }
            return acc + getPath(tmp, path, 0)
        }, 0)

        const numeratorSum = options.numerator.reduce((acc, path) => {
            if (typeof path == "number") {
                return acc + path
            }
            return acc + getPath(tmp, path, 0)
        }, 0)

        if (denominatorSum === 0) {
            setPath(tmp, outputPath, options.divByZero)
        } else {
            setPath(tmp, outputPath, numeratorSum / denominatorSum)
        }
    }

    return dataset;
}),
subtract: new DataTransformer("subtract", (dataset, outputPath, options) => {
    for (const tmp of dataset.tmps) {
        const difference = getPath(tmp, options.minuend, 0) - getPath(tmp, options.subtrahend, 0)

        setPath(tmp, outputPath, difference)
    }

    return dataset;
}),
sum: new DataTransformer("sum", (dataset, outputPath, options) => {
    for (const tmp of dataset.tmps) {
        const summed = options.addends.reduce((acc, i) => {
            return acc + getPath(tmp, i, 0)
        }, 0)

        setPath(tmp, outputPath, summed)
    }

    return dataset;
}),
template: new DataTransformer("name", (dataset, outputPath, options) => {
    return dataset;
}),
weightedSum: new DataTransformer("weightedSum", (dataset, outputPath, options) => {
    for (let tmp of dataset.tmps) {
        let sum = 0;
        for (let [pathString,weight] of Object.entries(options.weightedPaths)) {
            sum += getPath(tmp, pathString, 0) * weight;
        }
        setPath(tmp,outputPath,sum);
    }
    return dataset;
}),
},
team: {
aggregateArray: new DataTransformer("aggregateArray", (dataset, outputPath, options) => {
    for (let [teamNumber,team] of Object.entries(dataset.teams)) {
        let teamTmps = dataset.tmps.filter(x=>x.robotNumber == teamNumber); //only the tmps that are this team's
        setPath(team,outputPath,[]);

        for (let tmp of teamTmps) {
            let aggregateArray = getPath(team,outputPath).concat(getPath(tmp,options.path));
            setPath(team,outputPath,aggregateArray)
        }
    }
    return dataset;
}),
average: new DataTransformer("average", (dataset, outputPath, options) => {
    for (const [teamNumber, team] of Object.entries(dataset.teams)) {
        const teamTmps = dataset.tmps.filter(x=>x.robotNumber == teamNumber); //only the tmps that are this team's
        const pathResult = getPath(teamTmps[0], options.path)

        if (typeof pathResult == "object" && pathResult !== null) { //average all properties in object
            let out = {};
            for (let subpath in getPath(teamTmps[0], options.path)) {
                
                const filteredTeamTmps = teamTmps.filter((tmp) => getPath(tmp, `${options.path}.${subpath}`,null) !== null)
                let average = filteredTeamTmps.reduce((acc, tmp) => {
                    return acc + getPath(tmp, `${options.path}.${subpath}`) //if this is causing an error, your tmps may not have the same schema (eg. some keys (which you are trying to average) are not defined in some tmps)
                }, 0) / filteredTeamTmps.length;
                out[subpath] = average;
            }
            setPath(team, outputPath, out)
        } else { //normal numeric / null average
            const filteredTeamTmps = teamTmps.filter((tmp) => getPath(tmp, options.path) !== null)
            let average = filteredTeamTmps.reduce((acc, tmp) => {
                return acc + getPath(tmp, options.path)
            }, 0) / filteredTeamTmps.length

            setPath(team, outputPath, average)
        }
    }

    return dataset;
}),
averageArray: new DataTransformer("averageArray", (dataset, outputPath, options) => {
    for (let [teamNumber,team] of Object.entries(dataset.teams)) {
        let array = getPath(team,options.arrayPath);
        if (!Array.isArray(array)) throw new Error(`no array found at ${options.arrayPath}!`);

        let avg = array.reduce((acc, x) => acc + getPath(x, options.valuePath), 0) / array.length;
        setPath(team,outputPath,avg)
    }
    return dataset;
}),
countActions: new DataTransformer("countActions",(dataset,outputPath,options) => {
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
}),
countHybrid: new DataTransformer("countHybrid", (dataset, outputPath, options) => {
    return dataset;
}),
countMatches: new DataTransformer("countMatches", (dataset, outputPath, options) => {
    for (let [teamNumber,team] of Object.entries(dataset.teams)) {
        let matches = new Set(dataset.tmps //use a set to avoid duplicates
            .filter(x=>x.robotNumber == teamNumber) //only the tmps that are this team's
            .map(x=>x.matchNumber)).size; //dont count duplicate matches
        setPath(team,outputPath,matches*(options.weight || 1));
    }

    return dataset;
}),
ratio: new DataTransformer("ratio", (dataset,outputPath,options) => {
    /* iterate through TeamMatchPerformances */
    for (let [teamNumber, team] of Object.entries(dataset.teams)) {
        const denominatorSum = options.denominator.reduce((acc, path) => {
            if (typeof path == "number") {
                return acc + path
            }
            return acc + getPath(team, path, 0)
        }, 0)

        const numeratorSum = options.numerator.reduce((acc, path) => {
            if (typeof path == "number") {
                return acc + path
            }
            return acc + getPath(team, path, 0)
        }, 0)

        if (denominatorSum === 0) {
            setPath(team, outputPath, options.divByZero || "N/A")
        } else {
            setPath(team, outputPath, numeratorSum / denominatorSum)
        }
    }

    return dataset;
}),
standardDeviation: new DataTransformer("standardDeviation", (dataset, outputPath, options) => {
  for (let [teamNumber,team] of Object.entries(dataset.teams)) {
    let teamTmps = dataset.tmps.filter(x=>x.robotNumber == teamNumber); //only the tmps that are this team's
    let scores = []
    for (let tmp of teamTmps) {
      scores.push(getPath(tmp,options.path))
    }
    let n = scores.length
    let mean = scores.reduce((a, b) => a + b) / n
    let sd = Math.sqrt(scores.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n)
    console.log(scores)
    console.log(mean)
    console.log(sd)
    setPath(team,outputPath,sd)
  }
  
  return dataset;
}),
subtract: new DataTransformer("subtract", (dataset, outputPath, options) => {
    for (const [teamNumber, team] of Object.entries(dataset.teams)) {
        const difference = getPath(team, options.minuend, 0) - getPath(team, options.subtrahend, 0)

        setPath(team, outputPath, difference)
    }

    return dataset;
}),
sum: new DataTransformer("sum", (dataset, outputPath, options) => {
    for (const [teamNumber, team] of Object.entries(dataset.teams)) {
        const summed = options.addends.reduce((acc, i) => {
            return acc + getPath(team, i, 0)
        }, 0)

        setPath(team, outputPath, summed)
    }

    return dataset;
}),
template: new DataTransformer("name", (dataset, outputPath, options) => {
    return dataset;
}),
threshold: new DataTransformer("threshold", (dataset, outputPath, options) => {
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
}),
},
    };
}

module.exports = { getTransformers }; 