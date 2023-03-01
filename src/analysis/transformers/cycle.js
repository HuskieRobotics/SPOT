const { setPath } = require("../../lib/util");
const {DataTransformer} = require("../DataTransformer");

module.exports = {
    /**
     * @type {DataTransformer}
     * @param options.pickups {String[]} a list of actionIds that correspond to game piece "pickups" (eg. loading station, ground pickup)
     * @param options.scores {String[]} a list of actionIds that correspond to game piece "scores" (eg. upper hub, lower hub)
     * @param options.misses {String[]} a list of acitonIds that correspond to game piece "misses" (eg. miss)
     */
    tmp: new DataTransformer("cycle", (dataset, outputPath, options) => {
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
    })
}