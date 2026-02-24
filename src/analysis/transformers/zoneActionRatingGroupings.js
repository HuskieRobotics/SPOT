/**
 * @type {DataTransformer}
 * @param options.zones {String[]} actionIds for alliance zone buttons (e.g., redZone/neutralZone/blueZone)
 * @param options.actions {String[]} actionIds for action buttons (e.g., defense/passing/stopShoot)
 * @param options.ratings {String[]} actionIds for rating buttons (e.g., ratingPassing1..4)
 */ 
__TMP__
new DataTransformer("zoneActionRatingGroupings", (dataset, outputPath, options) => {
    for (let tmp of dataset.tmps) {

      // create an options object that will return an array of all the zones selected, actions selected, and ratings selected for a specific match.
      options = Object.assign({ 
        zones: [],
        actions: [],
        ratings: []
      }, options);

      let list = []; // to store sequential triples of { zone, action, rating }

      // Go through the actionQueue and filter out all the buttons that are rating, action, or zone buttons.
      let ratings = tmp.actionQueue.filter(x=>options.ratings.includes(x.id));
      let actions = tmp.actionQueue.filter(x=>options.actions.includes(x.id));
      let zones = tmp.actionQueue.filter(x=>options.zones.includes(x.id));

      while (zones.length > 0) {
            
        let zone = zones.shift(); //remove and get the first zone button pressed
        let zoneId = zone.id;

        actions = actions.filter(x=>x.ts < zone.ts) // assign the actions array to an array of actions that occur after the selected zone

        if (actions.length === 0) {
        break; //ensure that the actions button was pressed after the zone button, if there are no actions left to remove, break out of the loop
        } else {
          let action = actions.shift(); //remove the action that comes directly after the most recently pressed zone button
          let actionId = action.id;
        }

        ratings = ratings.filter(x=>x.ts < action.ts) //populate the ratings array with the ratings of all the ratings that occur after the selected action
          
        if (ratings.length === 0) {
        break; //ensure that there is a rating button pressed after the action button, if there are no ratings left to remove, break out of the loop
        } else {
          let rating = ratings.shift(); //remove the rating that comes directly after the most recently pressed action and zone button
          let ratingValue = parseRatingValue(rating.id);
        }
        
       list.push({ zone: zoneId, action: actionId, rating: ratingValue }); //add the triple of zone, action, and rating to the list output

      // Create paths for each zone, action, and rating combination to store the count of each rating for each zone and action combination. For example, output.rating.redZone.defense.ratingPassing3 would represent the count of ratingPassing3 ratings for redZone defense actions.
      if (ratingValue != null && actionId != null && zoneId != null) {

        if(output.zoneId === undefined){
            output.zoneId = {};
          }
        if(output.zoneId.actionId === undefined){
            output.zoneId.actionId = {};
          }
        if(output.zoneId.actionId.rating === undefined){
            output.zoneId.actionId.rating = {};
          }
        if(output.zoneId.actionId.ratingValue === undefined){
            output.zoneId.actionId.ratingValue = 0;
        }

        output.zoneId.actionId.ratingValue += 1; //increment the count for the specific zone, action, and rating combination by 1
        }
      }
      
      const output = {
        list: [],   // sequential triples: { zone, action, rating }
        // rating: {}  // represents the numeric rating value for each zone, action, and rating combination
      };

      // Extract trailing digit(s) from ratingId (e.g., ratingPassing3 -> 3)
      const parseRatingValue = (ratingId) => {
        const match = String(ratingId).match(/(\d+)$/);
        return match ? Number(match[1]) : null;
      };
  
      // Persist under outputPath in analysis pipeline (e.g., "zoneActionRating")
      setPath(tmp, outputPath, output);
     
  }
    return dataset; 
  })
__/TMP__

