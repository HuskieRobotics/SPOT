/**
 * @type {DataTransformer}
 * @param options.startAction {String[]} a list of actionIds that correspond to game piece "startAction" (eg. loading station, ground pickup)
 * @param options.endAction {String[]} a list of actionIds that correspond to game piece "endAction" (eg. upper hub, lower hub)
 * @param options.misses {String[]} a list of actionIds that correspond to game piece "misses" (eg. miss)
 */ 
__TMP__
new DataTransformer("cycle", (dataset, outputPath, options) => {
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
            startAction: [],
            endAction: [],
            misses: []
        },options)

        let startAction = tmp.actionQueue.filter(x=>options.startAction.includes(x.id));
        let endings = tmp.actionQueue.filter(x=>options.endAction.includes(x.id) || options.misses.includes(x.id));

        while (startAction.length > 0) {
            
            let starts = startAction.shift();

            endings = endings.filter(x=>x.ts < starts.ts) //ensure the ends attributed to a pickup occur after the pickup
            if (endings.length === 0) break //no cycles can be completed without a ending

            let ending = endings.shift();

            out.all.push({
                starts,
                ending,
                timeDifferential: starts.ts - ending.ts
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
__/TMP__