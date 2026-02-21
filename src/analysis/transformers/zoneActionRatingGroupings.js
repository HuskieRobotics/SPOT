/**
 * @type {DataTransformer}
 * @param options.zones {String[]} actionIds for alliance zone buttons (e.g., redZone/neutralZone/blueZone)
 * @param options.actions {String[]} actionIds for action buttons (e.g., defense/passing/stopShoot)
 * @param options.ratings {String[]} actionIds for rating buttons (e.g., ratingPassing1..4)
 */ 
__TMP__
new DataTransformer("zoneActionRatingGroupings", (dataset, outputPath, options) => {
    for (let tmp of dataset.tmps) {

      // Merge defaults with provided options for safety
      options = Object.assign({ 
        zones: [],
        actions: [],
        ratings: []
      }, options);

      // Copy actionQueue so we can splice without mutating original
      const actionQueue = Array.isArray(tmp.actionQueue) ? tmp.actionQueue.slice() : [];

      // Split by category and sort by timestamp
      const zones = actionQueue.filter(x => options.zones.includes(x.id)).sort((a,b)=>a.ts-b.ts);
      const actions = actionQueue.filter(x => options.actions.includes(x.id)).sort((a,b)=>a.ts-b.ts);
      const ratings = actionQueue.filter(x => options.ratings.includes(x.id)).sort((a,b)=>a.ts-b.ts);

      const output = {
        list: [],   // sequential triples: { zone, action, rating }
        rating: {}  // rating[zoneId][actionId][ratingValue] = count
      };

      // Returns the next item in arr occurring after ts, and removes it from arr
      const nextAfter = (arr, ts) => {
        const idx = arr.findIndex(x => x.ts > ts);
        if (idx === -1) return null;
        return arr.splice(idx, 1)[0];
      };

      // Extract trailing digit(s) from ratingId (e.g., ratingPassing3 -> 3)
      const parseRatingValue = (ratingId) => {
        const match = String(ratingId).match(/(\d+)$/);
        return match ? Number(match[1]) : null;
      };

      // For each zone press, pair it with the next action and next rating after it
      while (zones.length > 0) {
        const zone = zones.shift();
        const action = nextAfter(actions, zone.ts);
        if (!action) break;

        const rating = nextAfter(ratings, action.ts);
        if (!rating) break;

        // Save raw triple for debug/inspection
        output.list.push({ zone, action, rating });

        const zoneId = zone.id;
        const actionId = action.id;
        const ratingValue = parseRatingValue(rating.id);

        // Aggregate counts by zone + action + rating value
        if (ratingValue != null && actionId != null && zoneId != null) {
          // if (!output.rating[zoneId]) output.rating[zoneId] = {};
          // if (!output.rating[zoneId][actionId]) output.rating[zoneId][actionId] = {};
          // if (!output.rating[zoneId][actionId][ratingValue]) output.rating[zoneId][actionId][ratingValue] = 0;
          // output.rating[zoneId][actionId][ratingValue] += 1;

          if(output.rating.zoneId === undefined){
              output.rating.zoneId = {};
            }
          if(output.rating.zoneId.actionId === undefined){
              output.rating.zoneId.actionId = {};
            }
          if(output.rating.zoneId.actionId.ratingValue === undefined){
              output.rating.zoneId.actionId.ratingValue = 0;
            }

          output.rating.zoneId.actionId.ratingValue += 1;
        }

      // Persist under outputPath in analysis pipeline (e.g., "zoneActionRating")
      setPath(tmp, outputPath, output);
    } 
  }
    return dataset; 
  })
__/TMP__

