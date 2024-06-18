/**
count number of each piece placed in hybrid slots
  * @type {DataTransformer}
  * @param options.pickup {String[]} pickup ids for pieces
  * @param options.hybrid {String[]} ids of hybrid slots
  * @param options.actionArrayPath {String} path to array of actions
  */
__TMP__
new DataTransformer("countHybrid", (dataset, outputPath, options) => {
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
})
__/TMP__

/**
 * @type {DataTransformer}
 * @param options.example {String} example parameter description
 */
__TEAM__
new DataTransformer("countHybrid", (dataset, outputPath, options) => {
    return dataset;
})
__/TEAM__