/**
 * @type {DataTransformer}
 * @param options.zones {String[]} actionIds for alliance zone buttons (e.g., redZone/neutralZone/blueZone)
 * @param options.actions {String[]} actionIds for action buttons (e.g., defense/passing/stopShoot)
 * @param options.ratings {String[]} actionIds for rating buttons (e.g., ratingPassing1..4)
 */ 
__TMP__
new DataTransformer("zoneActionRatingGroupings", (dataset, outputPath, options) => {

    options = Object.assign({ 
      zones: [],
      actions: [],
      ratings: []
    }, options);

    for (let tmp of dataset.tmps) {

      const output = {
        list: [],   // sequential triples: { zone, action, rating }
        rating: {}  // represents the numeric rating value for each zone, action, and rating combination
      };

      // Extract trailing digit(s) from ratingId (e.g., ratingPassing3 -> 3)
      const parseRatingValue = (ratingId) => {
        const match = String(ratingId).match(/(\d+)$/);
        return match ? Number(match[1]) : null;
      };

      // Go through the actionQueue and filter out all the buttons that are rating, action, or zone buttons.
      // Keep each item's original queue index so matching can be done by event order.
      const queueWithIndex = tmp.actionQueue.map((item, index) => ({ ...item, __queueIndex: index }));
      let ratings = queueWithIndex.filter(x=>options.ratings.includes(x.id));
      let actions = queueWithIndex.filter(x=>options.actions.includes(x.id));
      let zones = queueWithIndex.filter(x=>options.zones.includes(x.id));

      while (zones.length > 0) {
            
        let zone = zones.shift(); //remove and get the first zone button pressed
        let zoneId = zone.id;

        const actionIndex = actions.findIndex(x=>x.__queueIndex > zone.__queueIndex); // assign the first action that occurs after the selected zone
        if (actionIndex === -1) {
          continue;
        }

        let action = actions.splice(actionIndex, 1)[0]; //remove the matched action
        let actionId = action.id;

        const ratingIndex = ratings.findIndex(x=>x.__queueIndex > action.__queueIndex) //populate the first rating that occurs after the selected action
        if (ratingIndex === -1) {
          continue;
        }

        let rating = ratings.splice(ratingIndex, 1)[0]; //remove the matched rating
        let ratingValue = parseRatingValue(rating.id);
        let ratingKey = `rating${ratingValue}`;

        output.list.push({ zone: zoneId, action: actionId, rating: ratingValue }); //add the triple of zone, action, and rating to the list output

      // Create paths for each zone, action, and rating combination to store the count of each rating for each zone and action combination.
      // For example, output.rating.redZone.defense.ratingPassing3 would represent the count of ratingPassing3 ratings for redZone defense actions.
      if (ratingValue != null && actionId != null && zoneId != null) {

        if (output.rating[zoneId] === undefined) {
            output.rating[zoneId] = {};
          }
        if (output.rating[zoneId][actionId] === undefined) {
            output.rating[zoneId][actionId] = {};
          }
        if (output.rating[zoneId][actionId][ratingKey] === undefined) {
            output.rating[zoneId][actionId][ratingKey] = 0;
          }

        output.rating[zoneId][actionId][ratingKey] += 1;

        if (output[zoneId] === undefined) {
          output[zoneId] = {};
        }
        if (output[zoneId][actionId] === undefined) {
          output[zoneId][actionId] = {};
        }
        if (output[zoneId][actionId][ratingKey] === undefined) {
          output[zoneId][actionId][ratingKey] = 0;
        }

        output[zoneId][actionId][ratingKey] += 1;
        }
      }
  
      // Call the setPath function to set the output at the specified outputPath
      setPath(tmp, outputPath, output);
     
  }
    return dataset; 
  })
__/TMP__

