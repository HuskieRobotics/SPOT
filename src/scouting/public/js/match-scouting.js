let actionQueue = [];
let devEnd

(async () => {

    config = await config;
    matchScoutingConfig = await matchScoutingConfig;

    //initiate timing
    let time = matchScoutingConfig.timing.totalTime;
    let timerActive = false;
    //create grid
    const grid = document.querySelector("#match-scouting .button-grid");
    grid.style.gridTemplateColumns = `repeat(${matchScoutingConfig.layout.gridColumns}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${matchScoutingConfig.layout.gridRows}, 1fr)`;


    //build buttons
    const layers = deepClone(matchScoutingConfig.layout.layers);
    const buttons = layers.flat();

    const buttonBuilders = { //an object to give buttons type specific things, button type: function (button)
        "action": (button) => {
            //add an action to the actionQueue
            button.element.addEventListener("click", () => {
                actionQueue.push({
                    "id": button.id,
                    "ts": time,
                })
                doExecutables(button)
            })
        },

        "undo": (button) => {
            button.element.addEventListener("click", () => {
                const undoneId = actionQueue.pop().id //remove the last action from the action queue 
                const undoneButton = buttons.find(x => x.id === undoneId);

                //special case for match-control buttons which have extra undo funcitonality without executables
                if (undoneButton.type === "match-control") {
                    time = matchScoutingConfig.timing.totalTime; //reset timer
                    ScoutingSync.updateState({status: ScoutingSync.SCOUTER_STATUS.SCOUTING}); //tell the server that you are now waiting to start
                    clearInterval(undoneButton.timerInterval); //clear the timing interval
                    undoneButton.element.innerText = "Start Match" + " | Your Team: " + ScoutingSync.state.robotNumber;
                    timerActive = false;
                    showLayer(0);
                }

                for (const executable of undoneButton.executables) {
                    executables[executable.type].reverse(undoneButton, layers, ...executable.args) //reverse any executables associated with the undone button
                }
                doExecutables(button)
            })
        },

        "none": (button) => {
            //add a temporary event to the action queue with no id which will be removed before the action queue is sent
            button.element.addEventListener("click", () => {
                actionQueue.push({
                    "id": button.id,
                    "ts": time,
                    "temp": true
                })
                doExecutables(button)
            })
        },

        "cancel": (button) => {
            //add a temporary event to the action queue with no id which will be removed before the action queue is sent
            button.element.addEventListener("click", () => {
                location.href = '/';
            })
        },

        "info": (button) => {
            //add a temporary event to the action queue with no id which will be removed before the action queue is sent
            button.element.addEventListener("click", () => {
                setPage("match-scouting")
                switchPage("instructions")
            })
        },

        "match-control": (button) => {
            button.element.innerText = "Start Match";
            button.element.addEventListener("click", async () => {
                // Handle click after timer runs out
                if (time <= 0) {
                    console.log("submitting")
                    await LocalData.storeTeamMatchPerformance(new TeamMatchPerformance(actionQueue).data)
                    await ScoutingSync.sync();
                    window.location.reload();
                }

                if (timerActive) return;

                actionQueue.push({ //create a temporary action queue so you can undo it
                    "id": button.id,
                    "ts": time,
                    "temp": true
                })

                ScoutingSync.updateState({status: ScoutingSync.SCOUTER_STATUS.SCOUTING}); //tell the server that you started scouting

                let displayText = "";
                let start = Date.now()
                devEnd = () => {
                    start = Date.now() - (matchScoutingConfig.timing.totalTime - 1)
                }
                const transitions = Object.keys(matchScoutingConfig.timing.timeTransitions).map(x => Number(x)).sort((a, b) => b - a);
                timerActive = true;
                button.timerInterval = setInterval(() => {
                    if (time <= transitions[0]) { //move to the next transition if it is time
                        displayText = matchScoutingConfig.timing.timeTransitions[transitions[0]].displayText + " | Your Team: " + ScoutingSync.state.robotNumber;
                        showLayer(matchScoutingConfig.timing.timeTransitions[transitions[0]].layer);
                        transitions.shift()
                    }
                    if (time <= 0) {
                        buttons.filter(x => x.type === "match-control").forEach((b) => { //update all match-control buttons (even those in different layers)
                            b.element.innerText = "Match Complete";
                            setTimeout(() => {
                                b.element.innerText = "Submit Match";
                            }, 2000)
                        });
                        clearInterval(button.timerInterval); //clear the timing interval

                        return;
                    }
                    time = matchScoutingConfig.timing.totalTime - (Date.now() - start);
                    buttons.filter(x => x.type === "match-control").forEach((b) => { //update all match-control buttons (even those in different layers)
                        b.element.innerText = `${(time / 1000).toFixed(2)} | ${displayText}`;
                    });
                }, 10);
                doExecutables(button);
            })
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
    ScoutingSync.updateState({status: ScoutingSync.SCOUTER_STATUS.SCOUTING}); //tell the server that you started scouting


    showLayer(0); //initially show layer 0

    function doExecutables(button) {
        for (const executable of button.executables) {
            try {
                executables[executable.type].execute(button, layers, ...executable.args);
            } catch (e) {
                console.error(e);
                throw new Error(`Error occured within ${executable.type} executable!`)
            }
        }
    }

    function showLayer(layer) {
        for (const b of buttons) {
            b.element.style.display = "none";
        }
        for (const b of layers[layer]) {
            b.element.style.display = "flex";
        }
    }

    // DATA
    class TeamMatchPerformance {
        data;

        constructor(actionQueue) {
            let filteredActionQueue = actionQueue.filter(action => !action.temp);
            filteredActionQueue = filteredActionQueue.map(x => {
                x.ts = Math.max(x.ts, 0);
                return x;
            })
            this.data = {
                matchId: `${ScoutingSync.state.matchNumber}-${ScoutingSync.state.robotNumber}-${ScoutingSync.state.scouterId}-${Math.floor((Math.random() * 2 ** 32)).toString(32)}`,
                timestamp: Date.now(),
                clientVersion: config.VERSION,
                scouterId: ScoutingSync.state.scouterId, // from scouting-sync.js
                robotNumber: Number(ScoutingSync.state.robotNumber), // from scouting-sync.js
                matchNumber: Number(ScoutingSync.state.matchNumber),
                eventNumber: config.EVENT_NUMBER,
                actionQueue: filteredActionQueue,
            }
        }
    }
})()