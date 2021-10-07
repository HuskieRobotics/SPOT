var actionQueue = [];

(async () => {
    const config = await (await fetch(`/config.json`)).json();
    
    //initiate timing
    let time = config.timing.totalTime;
    //create grid
    const grid = document.querySelector("#match-scouting .button-grid");
    grid.style.gridTemplateColumns = `repeat(${config.layout.gridColumns}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${config.layout.gridRows}, 1fr)`;
    
    //build buttons
    const layers = deepClone(config.layout.layers);
    const buttons = layers.flat();

    const buttonBuilders = { //an object to give buttons type specific things, button type: function (button)
        "action": (button) => {
            //add an action to the actionQueue
            button.element.addEventListener("click", () => { 
                actionQueue.push({
                    "id": button.id,
                    "ts": Date.now()
                })
            })
        },

        "undo": (button) => {
            //undo a button press that changes the action queue
            const undoneId = actionQueue.pop().id //remove the last action from the action queue 
            const undoneButton = buttons.find(x => x.id === undoneId);
            for (const executable of undoneButton.executables) {
                executable.reverse(...executable.args) //reverse any executables associated with the undone button
            }
        },

        "none": (button) => {
            //do nothing
        },

        "match-control": (button) => {
            button.element.innerText = "Start Match";
            button.element.addEventListener("click", () => {
                let displayText = "";
                const start = Date.now()
                const transitions = Object.keys(config.timing.timeTransitions).map(x => Number(x)).sort((a,b) => b - a);
                const timeInterval = setInterval(() => {
                    if (time <= transitions[0]) {
                        displayText = config.timing.timeTransitions[transitions[0]].displayText;
                        transitions.shift()
                    }
                    if (time <= 0) {
                        clearInterval(timeInterval);
                    }
                    time = config.timing.totalTime - (Date.now() - start);
                    buttons.filter(x => x.type === "match-control").forEach((b) => {
                        b.element.innerText = `${(time / 1000).toFixed(2)} | ${displayText}`;
                    });
                }, 10)
            }, {once: true})
        }
    }

    //create button objects in layers
    for (const layer of layers) {
        for (const button of layer) {
            button.element = document.createElement("div");
            
            //give the button element its properties
            button.element.innerText = button.displayText || button.id;
            button.element.classList.add("grid-button", ...button.class.split(" "));
            button.element.style.gridArea = button.gridArea.join(" / ");
            
            //apply type to button
            buttonBuilders[button.type](button);
            //add the button to the grid
            grid.appendChild(button.element);
        }
    }
    showLayer(0);
    
    function showLayer(layer) {
        for (const b of buttons) {
            b.element.style.display = "none";
        }
        for (const b of layers[layer]) {
            b.element.style.display = "flex";
        }
    }
})()