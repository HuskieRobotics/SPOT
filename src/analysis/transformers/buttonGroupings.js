/**
*  @param options.AZButtons {String[]} a list of the actionIds for the alliance zone buttons pressed sorted by timestamp
 * @param options.actions {String[]} a list of actionIds that correspond to the action buttons pressed throughout the match sorted by timestamp
 * @param options.ratings {String[]} a list of actionIds that correspond to ratings buttons pressed for a specific action during a certain time interval
 */ 
_TMP__
  new DataTransformer("buttonGroupingsPerShift", (dataset,outputPath,options) => {
  for (let tmp of dataset.tmps) {
        let out = {
            allianceZone: 
            all: [],
            allComplete: null,
            averageTime: null,
            averageTimeComplete: null,
            cycleCount: null,
            cycleCountComplete: null
        }

        options = Object.assign({
            zones: [],
            actions: [],
            ratings: []
        },options)

        let ratings = tmp.actionQueue.filter(x=>options.ratings.includes(x.id));
        let actions = tmp.actionQueue.filter(x=>options.actions.includes(x.id));
        let zones = tmp.actionQueue.filter(x=>options.zones.includes(x.id));

        while (zones.length > 0) {
            
            let zone = zones.shift();

            actions = actions.filter(x=>x.ts < zone.ts) //ensure the ratings attributed to a zone occur after the zone
            if (actions.length === 0) break //no actions can be completed without an action
            let action = actions.shift();
            
            ratings = ratings.filter(x=>x.ts < action.ts) //ensure the ratings attributed to an action occur after the action
            if(ratings.length === 0) break //no ratings can be completed without a rating
            let rating = ratings.shift();

            // create a list to keep track of the triplets that were just found
            out.zones.push({
                zone,
                rating,
                timeDifferential: zone.ts - rating.ts
            })
        }
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
    return {
    
    const actionIds = Array.isArray(options.actions)
    
    let AZButtons = [];        
    AZButtons = matchScoutingConfig.layout.layers.flat().filter(button => button.allianceZoneButton).map(button => button.id);
        
    for(let AZButton of AZButtons) {
        
      }
    }};
__/TMP__

