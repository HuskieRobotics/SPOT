/**
*  @param options.zones {String[]} a list of the actionIds for the alliance zone buttons pressed sorted by timestamp
 * @param options.actions {String[]} a list of actionIds that correspond to the action buttons pressed throughout the match sorted by timestamp
 * @param options.ratings {String[]} a list of actionIds that correspond to ratings buttons pressed for a specific action during a certain time interval
 */ 
_TMP__
  new DataTransformer("buttonGroupingsPerShift", (dataset,outputPath,options) => {
  for (let tmp of dataset.tmps) {

        let output = {
            all: [], // all will contain all the zones and ratings for this specific match
            zones: [], // zone represents the zone buttons pressed during a specific match
            ratings: [], // rating represents the rating buttons pressed during a specific match    
        }

        //Options are parameters for this specific data transformer
        //Object.assign copies properties from the source to the option object (and those properties are zones, actions, and ratings, which are all lists of actionIds for the respective buttons pressed during the match sorted by timestamp)
        options = Object.assign({ 
            zones: [],
            actions: [],
            ratings: []
        }, options)

        let ratings = tmp.actionQueue.filter(x=>options.ratings.includes(x.id));
        let actions = tmp.actionQueue.filter(x=>options.actions.includes(x.id));
        let zones = tmp.actionQueue.filter(x=>options.zones.includes(x.id));

        while (zones.length > 0) {
            
            let zone = zones.shift(); //remove and get the first zone button pressed

            actions = actions.filter(x=>x.ts < zone.ts) //ensure the ratings attributed to a zone occur after the zone
            
            if (actions.length === 0) break //ensure that the actions button was pressed after the zone button, if there are no actions left to remove, break out of the loop
                let action = actions.shift();
            
            ratings = ratings.filter(x=>x.ts < action.ts) //ensure the ratings attributed to an action occur after the action
            
            if(ratings.length === 0) break //ensure that there is a ratings button pressed after the action button, if there are no ratings left to remove, break out of the loop
                let rating = ratings.shift();

            //Based on the zone and rating buttons pressed during a time interval of the match, add that to a list called all, which is a property of the buttonsPressedDuringMatch object. 
            output.all.push({
                zones: [zone],
                ratings: [rating],
            })
        }

        //For each button grouping in the all property of the buttonsPressedDuringMatch object, create a list of the zones, actions, and ratings for each grouping and set those as properties of the buttonsPressedDuringMatch object.
        output.zones = output.all.map(x=>x.zone);
        output.ratings = output.all.map(x=>x.rating);

        setPath(tmp,outputPath,output);
        
        }     
        return dataset;
  });
__/TMP__

