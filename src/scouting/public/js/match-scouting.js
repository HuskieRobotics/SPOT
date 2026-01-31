let actionQueue = [];
let devEnd;
var variables = {};
var previousLayers = [];
var previousTimer = [];

(async () => {
  config = await config;
  matchScoutingConfig = await matchScoutingConfig;
  //initiate timing
  var time = matchScoutingConfig.timing.totalTime;
  var teleopTime = 130000;
  var endgameTime = 30000;
  var shiftSwitchInterval = 25000;
  var timerActive = false;
  var currentShift = "active"; // Track current shift (active/inactive)
  var lastShiftSwitchTime = teleopTime; // Track when the last shift switch occurred
  var shiftButtonPressed = false; // Flag to track if a shift button has been pressed

  //intialize variables
  let varNames = Object.keys(matchScoutingConfig.variables);
  for (let key of varNames) {
    variables[key] = {
      current: matchScoutingConfig.variables[key],
      previous: [],
    };
  }
  //create grid
  const grid = document.querySelector("#match-scouting .button-grid");
  grid.style.gridTemplateColumns = `repeat(${matchScoutingConfig.layout.gridColumns}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${matchScoutingConfig.layout.gridRows}, 1fr)`;

  function updateLastAction() {
    const actionQueueIds = actionQueue.map((a) => a.id);
    const lastActions = [];
    for (let i = actionQueueIds.length - 1; i >= 0; i--) {
      if (lastActions[lastActions.length - 1]?.id !== actionQueueIds[i]) {
        if (lastActions.length < 3) {
          lastActions.push({
            id: actionQueueIds[i],
            num: 1,
          });
        } else {
          break;
        }
      } else {
        lastActions[lastActions.length - 1].num++;
      }
    }
    document.querySelector(".status .last-actions").innerText = lastActions
      .reverse()
      .map((a) => a.id + (a.num > 1 ? ` (${a.num})` : ""))
      .join(" ➔ ");
  }

  //build buttons
  const layers = deepClone(matchScoutingConfig.layout.layers);
  const buttons = layers.flat();

  const buttonBuilders = {
    //an object to give buttons type specific things, button type: function (button)
    action: (button) => {
      //add an action to the actionQueue
      button.element.addEventListener("click", () => {
        actionQueue.push({
          id: button.id,
          ts: time,
        });
        // Update shift based on button press
        if (button.id === "teleopActive") {
          currentShift = "active";
          lastShiftSwitchTime = time;
          shiftButtonPressed = true;
        } else if (button.id === "teleopInactive") {
          currentShift = "inactive";
          lastShiftSwitchTime = time;
          shiftButtonPressed = true;
        }
        doExecutables(button);
        updateLastAction();
      });
    },

    undo: (button) => {
      button.element.addEventListener("click", () => {
        if (
          actionQueue.length > matchScoutingConfig.variables.minOfQueueLength
        ) {
          // Basically, if this code was not in place (^), then you would be able to undo the start of the game.

          const undoneId = actionQueue.pop().id; //remove the last action from the action queue
          const undoneButton = buttons.find((x) => x.id === undoneId);

          //special case for match-control buttons which have extra undo funcitonality without executables
          if (undoneButton.type === "match-control") {
            time = matchScoutingConfig.timing.totalTime; //reset timer
            ScoutingSync.updateState({
              status: ScoutingSync.SCOUTER_STATUS.WAITING,
            }); //tell the server that you are now waiting to start
            clearInterval(undoneButton.timerInterval); //clear the timing interval
            undoneButton.element.innerText = "Start Match";
            timerActive = false;
            showLayer(0);
          }

          var totalNumberOfButtonsTeleopLayer = 13;
          var totalNumberOfButtonsAutoLayer = 11;
          var teleopLayerNumber = 7;

          if (time < teleopTime) {
            for (let i = 0; i < previousLayers.length; i++) {
              if (previousLayers[i].length === totalNumberOfButtonsAutoLayer) {
                previousLayers[i] = layers[teleopLayerNumber];
              }
            }
          }

          if (previousLayers[0] === totalNumberOfButtonsTeleopLayer) {
            showLayer(teleopLayerNumber);
          }
          for (const executable of undoneButton.executables) {
            executables[executable.type].reverse(
              undoneButton,
              layers,
              ...executable.args,
            ); //reverse any executables associated with the undone button
          }
        }
        doExecutables(button, time);
        updateLastAction();
      });
    },

    none: (button) => {
      //add a temporary event to the action queue with no id which will be removed before the action queue is sent
      button.element.addEventListener("click", () => {
        actionQueue.push({
          id: button.id,
          ts: time,
          temp: true,
        });
        doExecutables(button, time);
        updateLastAction();
      });
    },

    label: () => {
      //adds a non-clickable label to the grid
    },

    "match-control": (button) => {
      button.element.innerText = "Start Match";
      button.element.addEventListener("click", async () => {
        // Handle click after timer runs out
        if (time <= 0) {
          for (const button of buttons) {
            button.element.classList.add("disabled");
          }
          new Popup("notice", "Submitting Data...", 1000);
          const teamMatchPerformance = new TeamMatchPerformance(actionQueue)
            .data;
          await LocalData.storeTeamMatchPerformance(teamMatchPerformance);

          if (await ScoutingSync.sync()) {
            await ScoutingSync.updateState({
              status: ScoutingSync.SCOUTER_STATUS.COMPLETE,
            });
            window.location.reload();
          } else {
            // display QR code
            const encoder = new QREncoder(); // Updated
            const dataUrl =
              await encoder.encodeTeamMatchPerformance(teamMatchPerformance);
            let qrContainer = document.createElement("div");
            let qrText = document.createElement("button");
            let qrImg = document.createElement("img");

            qrContainer.classList.add("qr-container");
            qrText.classList.add("qr-text");
            qrText.classList.add("button-grid");
            qrImg.classList.add("qr-img");

            qrImg.src = dataUrl;
            qrText.innerText = "Tap to Dismiss";

            qrContainer.appendChild(qrImg);
            qrContainer.appendChild(qrText);
            document.body.appendChild(qrContainer);

            qrContainer.addEventListener("click", () => {
              document.body.removeChild(qrContainer);
              window.location.reload();
            });
          }
        }

        if (timerActive) return;

        actionQueue.push({
          //create a temporary action queue so you can undo it
          id: button.id,
          ts: time,
          temp: true,
        });

        ScoutingSync.updateState({
          status: ScoutingSync.SCOUTER_STATUS.SCOUTING,
        }); //tell the server that you started scouting

        let displayText = "";
        let start = Date.now();
        devEnd = () => {
          start = Date.now() - (matchScoutingConfig.timing.totalTime - 1);
        };
        const transitions = Object.keys(
          matchScoutingConfig.timing.timeTransitions,
        )
          .map((x) => Number(x))
          .sort((a, b) => b - a);
        // Initialize displayText with the first applicable transition
        if (transitions.length > 0) {
          displayText =
            matchScoutingConfig.timing.timeTransitions[transitions[0]]
              .displayText || "";
        }
        timerActive = true;
        button.timerInterval = setInterval(() => {
          if (time <= transitions[0]) {
            //move to the next transition if it is time
            displayText =
              matchScoutingConfig.timing.timeTransitions[transitions[0]]
                .displayText;
            for (let key of Object.keys(
              matchScoutingConfig.timing.timeTransitions[transitions[0]]
                .variables,
            )) {
              variables[key].previous.push(variables[key].current);
              variables[key].current =
                matchScoutingConfig.timing.timeTransitions[
                  transitions[0]
                ].variables[key];
              console.log(`set ${key} to ${variables[key]}`);
            }
            showLayer(
              matchScoutingConfig.timing.timeTransitions[transitions[0]].layer,
              matchScoutingConfig.timing.timeTransitions[transitions[0]]
                .conditional,
              matchScoutingConfig.timing.timeTransitions[transitions[0]].always,
            );

            transitions.shift();
          }
          if (time <= 0) {
            buttons
              .filter((x) => x.type === "match-control")
              .forEach((b) => {
                //update all match-control buttons (even those in different layers)
                b.element.innerText = "Match Complete";
                setTimeout(() => {
                  b.element.innerText = "Submit Match";
                }, 2000);
              });
            clearInterval(button.timerInterval); //clear the timing interval

            return;
          }
          time = matchScoutingConfig.timing.totalTime - (Date.now() - start);
          window.currentTime = time; // Keep window.currentTime in sync

          // Handle shift switching during teleop (between teleopTime and endgameTime)
          // Only switch if a shift button has been pressed
          if (shiftButtonPressed && time < teleopTime && time > endgameTime) {
            const elapsedSinceSwitch = lastShiftSwitchTime - time;
            if (elapsedSinceSwitch >= shiftSwitchInterval) {
              // Switch shift
              currentShift = currentShift === "active" ? "inactive" : "active";
              lastShiftSwitchTime = time; // Update the switch time
            }
          }

          // Build display text with shift information
          let displayTextWithShift = displayText;
          if (time > teleopTime) {
            displayTextWithShift = `${displayText}`;
          } else if (time < teleopTime && time > endgameTime) {
            if (shiftButtonPressed) {
              const shiftDisplay =
                currentShift === "active" ? "Active Shift" : "Inactive Shift";
              displayTextWithShift = `${shiftDisplay}`;
            }
          } else if (time <= endgameTime) {
            displayTextWithShift = `Endgame - Active Shift`;
          }

          buttons
            .filter((x) => x.type === "match-control")
            .forEach((b) => {
              //update all match-control buttons (even those in different layers)
              b.element.innerText = `${(time / 1000).toFixed(2)} | ${displayTextWithShift}`;
            });
        }, 10);
        doExecutables(button);
        updateLastAction();
      });
    },
  };

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

  // Expose rebuild function for loadConfig executable

  showLayer(0); //initially show layer 0

  function doExecutables(button) {
    for (const executable of button.executables) {
      try {
        executables[executable.type].execute(
          button,
          layers,
          ...executable.args,
        );
      } catch (e) {
        console.error(e);
        throw new Error(`Error occured within ${executable.type} executable!`);
      }
    }
  }

  function showLayer(layer, conditional = {}, always = []) {
    // Validate layer exists
    if (!layers[layer] || layer < 0 || layer >= layers.length) {
      console.warn(`Layer ${layer} does not exist. Defaulting to layer 0.`);
      layer = 0;
    }

    for (const b of buttons) {
      b.element.style.display = "none";
    }
    if (Object.keys(conditional).length > 0) {
      var renderedButtons = [];
      for (let button of layers[layer]) {
        var targetVariables = [];
        var targetValues = [];
        var thingsToCheck = {};
        for (let [variable, valueData] of Object.entries(conditional)) {
          for (let [value, idList] of Object.entries(valueData)) {
            if (idList.includes(button.id)) {
              if (thingsToCheck[variable]) {
                thingsToCheck[variable].push(value);
              } else {
                thingsToCheck[variable] = [value];
              }
            }
          }
        }

        var display = false;
        for (let [variable, values] of Object.entries(thingsToCheck)) {
          if (values.includes(variables[variable].current)) {
            display = true;
          }
        }

        if (always.includes(button.id) || display) {
          button.element.style.display = "flex";
          renderedButtons.push(button);
        }
      }
      previousLayers.push(renderedButtons);
    } else {
      var rendered = [];
      for (const b of layers[layer]) {
        b.element.style.display = "flex";
        rendered.push(b);
      }
      previousLayers.push(rendered);
    }
  }

  function conditionalLayer() {
    var renderedButtons = [];
    for (let button of layers[toLayer]) {
      var targetVariables = [];
      var targetValues = [];
      var thingsToCheck = {};
      console.log(`testing ${button.id}`);
      for (let [variable, valueData] of Object.entries(conditionalRender)) {
        for (let [value, idList] of Object.entries(valueData)) {
          if (idList.includes(button.id)) {
            if (thingsToCheck[variable]) {
              thingsToCheck[variable].push(value);
            } else {
              thingsToCheck[variable] = [value];
            }
          }
        }
      }

      var display = false;
      for (let [variable, values] of Object.entries(thingsToCheck)) {
        if (values.includes(variables[variable].current)) {
          display = true;
        }
      }

      if (alwaysRender.includes(button.id) || display) {
        console.log(`rendering ${button.id}`);
        button.element.style.display = "flex";
        renderedButtons.push(button);
      }
    }
    previousLayers.push(renderedButtons);
  }

  // DATA
  class TeamMatchPerformance {
    data;
    constructor(actionQueue) {
      let filteredActionQueue = actionQueue.filter((action) => !action.temp);
      filteredActionQueue = filteredActionQueue.map((x) => {
        x.ts = Math.max(x.ts, 0);
        return x;
      });
      const rand = Math.floor(Math.random() * 2 ** 32).toString(32);

      this.data = {
        matchId: `${ScoutingSync.state.matchNumber}-${ScoutingSync.state.robotNumber}-${ScoutingSync.state.scouterId}-${rand}`,
        matchId_rand: rand,
        timestamp: Date.now(),
        clientVersion: config.VERSION,
        scouterId: ScoutingSync.state.scouterId, // from scouting-sync.js
        robotNumber: Number(ScoutingSync.state.robotNumber), // from scouting-sync.js
        matchNumber: Number(ScoutingSync.state.matchNumber),
        eventNumber: config.EVENT_NUMBER,
        actionQueue: filteredActionQueue,
      };
    }
  }
})();
