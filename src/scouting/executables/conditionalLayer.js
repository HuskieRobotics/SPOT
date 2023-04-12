/**
 * Shows another layer on button press
 * @param fromLayer the layer number the executable is transitioning from (normally the layer which contains the button)
 * @param toLayer the layer which the executable is transitioning to (the layer that will be shown).
 */
executables["conditionalLayer"] = {
    execute(button,layers,fromLayer,toLayer,alwaysRender,conditionalRender) {
        for (let button of layers.flat()) { //hide all buttons
            button.element.style.display = "none"
        }
      console.log("variables");
      console.log(variables)
        var renderedButtons = [] 
        for (let button of layers[toLayer]) {
          var targetVariables = [];
          var targetValues = [];
          var thingsToCheck = {
            
          }
          console.log(`testing ${button.id}`)
          for(let [variable,valueData] of Object.entries(conditionalRender)){
            for(let [value,idList] of Object.entries(valueData)) {
              if(idList.includes(button.id)){
                if(thingsToCheck[variable]){
                  thingsToCheck[variable].push(value)
                } else {
                  thingsToCheck[variable] = [value]
                }
                
                
              }
            }
          }
          
          var display = false;
          for(let [variable,values] of Object.entries(thingsToCheck)){
            if(values.includes(variables[variable].current)){
              display = true
            }
          }
          
          if(alwaysRender.includes(button.id) || (display)){
            console.log(`rendering ${button.id}`)
            button.element.style.display = "flex"
            renderedButtons.push(button)
          }
          
        }
        previousLayers.push(renderedButtons)
    },
    reverse(button,layers,fromLayer,toLayer,alwaysRender,conditionalRender) {
        for (let button of layers.flat()) { //hide all buttons
            button.element.style.display = "none"
        }
      console.log("undoing conditional layer")
      console.log("prev")
      console.log(previousLayers)
      
      previousLayers.pop();
      if(previousLayers.length>1){previousLayers.pop();}

      
      console.log("post")
      console.log(previousLayers)
      if(previousLayers.length-1 > 0){
        for (let button of previousLayers[previousLayers.length-1]) {
          console.log("displaying previous layer")
          button.element.style.display = "flex"
        }
      }
    }
}