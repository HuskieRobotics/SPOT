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

      //Extract the zone id (AZone, NeutralZone, OAZone) from the action id that contains the zone in it (e.g., teleopTransitionAZone -> AZone)
      const normalizeZoneId = (zoneId) => {
        const match = String(zoneId).match(/(AZone|NeutralZone|OAZone)$/);
        return match ? match[1] : zoneId;
      };

      //Parses all action id's to find the id of the specific action that was performed. For example, if the action id was activeShift1RatingPassing1, the function would return "Passing" as the action that was performed.
      const normalizeActionId = (actionId) => {
        const match = String(actionId).match(/(Defense|Passing|StopShooting|Storing)$/);
        return match ? match[1] : actionId;
      };

      const output = {
        list: [], //List contains the list of all the zone, action, and rating triplets that were performed in a specific match. 
        counts: {} //Counts represents the number of [zone, action, rating] triplets that were collected in the data transformer.
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
        break; // Ensure that there is a rating button pressed after the action button, if there are no ratings left to remove, break out of the loop
        } else {
          rating = ratings.shift(); // Remove the rating that comes directly after the most recently pressed action and zone button
          ratingValue = parseRatingValue(rating.id);
        }

      // Take the current zone and action button id's and call the respective normalize functions on them to get a specific zone and action that was performed in that zone. For example, if the zone button was teleopTransitionAZone, the normalized zone would be AZone. If the action button was activeShift1RatingPassing1, the normalized action would be Passing.
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
          if (summary.count > 0) {
            output[normalizedZone][normalizedAction] = summary.sum / summary.count;
          } else {
            output[normalizedZone][normalizedAction] = "No data"  ;
          }
        }
      }

      // Persist under outputPath in analysis pipeline (e.g., "zoneActionRating")
      setPath(tmp, outputPath, output);     
  }
    return dataset;
  })  
__/TMP__

