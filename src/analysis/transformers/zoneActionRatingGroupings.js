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

      // Extract trailing digit(s) from ratingId (e.g., ratingPassing3 -> 3)
      const parseRatingValue = (ratingId) => {
        const match = String(ratingId).match(/(\d+)$/);
        return match ? Number(match[1]) : null;
      };

      const normalizeZoneId = (zoneId) => {
        const match = String(zoneId).match(/(AZone|NeutralZone|OAZone)$/);
        return match ? match[1] : zoneId;
      };

      const normalizeActionId = (actionId) => {
        const match = String(actionId).match(/(Defense|Passing|StopShooting|Storing)$/);
        return match ? match[1] : actionId;
      };

      const output = {
        list: [],
        counts: {}
      };

      // Go through the actionQueue and filter out all the buttons that are rating, action, or zone buttons.
      let ratings = tmp.actionQueue.filter(x=>options.ratings.includes(x.id));
      let actions = tmp.actionQueue.filter(x=>options.actions.includes(x.id));
      let zones = tmp.actionQueue.filter(x=>options.zones.includes(x.id));

      let zone;
      let zoneId;
      let action;
      let actionId;
      let rating;
      let ratingValue;

      while (zones.length > 0) {
            
        zone = zones.shift(); //remove and get the first zone button pressed
        zoneId = zone.id;

        actions = actions.filter(x=>x.ts < zone.ts) // assign the actions array to an array of actions that occur after the selected zone

        if (actions.length === 0) {
        break; //ensure that the actions button was pressed after the zone button, if there are no actions left to remove, break out of the loop
        } else {
          action = actions.shift(); //remove the action that comes directly after the most recently pressed zone button
          actionId = action.id;
        }

        ratings = ratings.filter(x=>x.ts < action.ts) //populate the ratings array with the ratings of all the ratings that occur after the selected action
          
        if (ratings.length === 0) {
        break; //ensure that there is a rating button pressed after the action button, if there are no ratings left to remove, break out of the loop
        } else {
          rating = ratings.shift(); //remove the rating that comes directly after the most recently pressed action and zone button
          ratingValue = parseRatingValue(rating.id);
        }

      const normalizedZone = normalizeZoneId(zoneId);
      const normalizedAction = normalizeActionId(actionId);

      output.list.push({ zone: normalizedZone, action: normalizedAction, rating: ratingValue }); //add the triple of zone, action, and rating to the list output

      if (ratingValue != null && actionId != null && zoneId != null) {
        if(output.counts[normalizedZone] === undefined){
            output.counts[normalizedZone] = {};
          }
        if(output.counts[normalizedZone][normalizedAction] === undefined){
            output.counts[normalizedZone][normalizedAction] = {};
          }
        if(output.counts[normalizedZone][normalizedAction][ratingValue] === undefined){
            output.counts[normalizedZone][normalizedAction][ratingValue] = 0;
          }

        output.counts[normalizedZone][normalizedAction][ratingValue] += 1; //increment the count for the specific zone, action, and rating combination by 1

        if(output[normalizedZone] === undefined){
            output[normalizedZone] = {};
          }
        if(output[normalizedZone][normalizedAction] === undefined){
            output[normalizedZone][normalizedAction] = {
              sum: 0,
              count: 0
            };
          }

        output[normalizedZone][normalizedAction].sum += ratingValue;
        output[normalizedZone][normalizedAction].count += 1;
      }
      }

      for (let normalizedZone in output) {
        if (normalizedZone === "list" || normalizedZone === "counts") continue;
        for (let normalizedAction in output[normalizedZone]) {
          const summary = output[normalizedZone][normalizedAction];
          output[normalizedZone][normalizedAction] = summary.count > 0
            ? summary.sum / summary.count
            : 0;
        }
      }
  
      // Persist under outputPath in analysis pipeline (e.g., "zoneActionRating")
      setPath(tmp, outputPath, output);
     
  }
    return dataset; 
  })
__/TMP__

