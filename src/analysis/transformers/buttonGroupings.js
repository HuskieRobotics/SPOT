/**
*  @param options.AZButtons {String[]} a list of the actionIds for the alliance zone buttons pressed sorted by timestamp
 * @param options.actions {String[]} a list of actionIds that correspond to the action buttons pressed throughout the match sorted by timestamp
 * @param options.ratings {String[]} a list of actionIds that correspond to ratings buttons pressed for a specific action during a certain time interval
 */ 
_TMP__
  new DataTransformer("buttonGroupingsPerShift", (dataset,outputPath,options) => {})
    return {
    
    let AZButtons = [];        
    AZButtons = matchScoutingConfig.layout.layers.flat().filter(button => button.allianceZoneButton).map(button => button.id);
        
    for(let AZButton of AZButtons) {
        
      }
    };
__/TMP__

