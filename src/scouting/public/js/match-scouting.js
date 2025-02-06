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
  var teleopTime = 135000;
  var timerActive = false;
  /**
   * @type {Number}
   */
  var start = null, displayText = "";

  // Restore match state from localStorage if inMatch is true
  if (localStorage.getItem("inMatch") === "true") {
    actionQueue = JSON.parse(localStorage.getItem("actions")) || [];
    start = Number(localStorage.getItem("start")) || null;
    timerActive = localStorage.getItem("timerActive") === "true";
  }

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

  const algaePickupButtons = ["autoGroundPickupAlgae", "autoReefPickupAlgae", "teleopGroundPickupAlgae", "teleopReefPickupAlgae"];
  const algaeScoreButtons = ["autoScoreAlgae", "teleopScoreAlgae", "autoAlgaeDrop", "autoMissProcessor", "autoMissNet", "teleopAlgaeDrop", "teleopMissProcessor", "teleopMissNet"];
  const coralPickupButtons = ["autoGroundPickupCoral", "autoStationPickupCoral", "teleopGroundPickupCoral", "teleopStationPickupCoral", "preloadCoral"];
  const coralScoreButtons = ["autoScoreCoral", "teleopScoreCoral", "autoCoralDrop", "autoMissCoral", "teleopCoralDrop", "teleopMissCoral", "preloadNone"];

  function updateButtonStates() {
    let hasAlgae = false,
      hasCoral = false;
    for (const action of actionQueue) {
      if (algaePickupButtons.includes(action.id)) {
        hasAlgae = true;
      } else if (algaeScoreButtons.includes(action.id)) {
        hasAlgae = false;
      } else if (coralPickupButtons.includes(action.id)) {
        hasCoral = true;
      } else if (coralScoreButtons.includes(action.id)) {
        hasCoral = false;
      }
    }

    for (const button of buttons) {
      if (algaeScoreButtons.includes(button.id)) {
        button.element.classList.toggle("disabled", !hasAlgae);
      }
      if (coralScoreButtons.includes(button.id)) {
        button.element.classList.toggle("disabled", !hasCoral);
      }
      if (algaePickupButtons.includes(button.id)) {
        button.element.classList.toggle("disabled", hasAlgae);
      }
      if (coralPickupButtons.includes(button.id)) {
        button.element.classList.toggle("disabled", hasCoral);
      }
    }

    // Backup data to localStorage incase accidental refresh
    setTimeout(() => {
      localStorage.setItem("actions", JSON.stringify(actionQueue));
      localStorage.setItem("start", start);
      localStorage.setItem("timerActive", JSON.stringify(timerActive));
    }, 2000);
  }

  const buttonBuilders = {
    //an object to give buttons type specific things, button type: function (button)
    action: (button) => {
      //add an action to the actionQueue
      button.element.addEventListener("click", () => {
        actionQueue.push({
          id: button.id,
          ts: Date.now(),
        });
        doExecutables(button);
        updateLastAction();
        updateButtonStates();
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

          var totalNumberOfButtonsTeleopLayer = 12;
          var totalNumberOfButtonsAutoLayer = 13;
          var teleopLayerNumber = 2;

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
              ...executable.args
            ); //reverse any executables associated with the undone button
          }
        }
        doExecutables(button, time);
        updateLastAction();
        updateButtonStates();
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

          localStorage.setItem("inMatch", "false"); // Set inMatch to false when match ends

          if (await ScoutingSync.sync()) {
            await ScoutingSync.updateState({
              status: ScoutingSync.SCOUTER_STATUS.COMPLETE,
            });
            window.location.reload();
          } else {
            // display QR code
            const encoder = new QREncoder(); // Updated
            const dataUrl = await encoder.encodeTeamMatchPerformance(
              teamMatchPerformance
            );

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

        start = Date.now();
        devEnd = () => {
          start = Date.now() - (matchScoutingConfig.timing.totalTime - 1);
        };
        const transitions = Object.keys(
          matchScoutingConfig.timing.timeTransitions
        )
          .map((x) => Number(x))
          .sort((a, b) => b - a);
        timerActive = true;
        localStorage.setItem("inMatch", "true");
        button.timerInterval = setInterval(() => {
          if (time <= transitions[0]) {
            //move to the next transition if it is time
            displayText =
              matchScoutingConfig.timing.timeTransitions[transitions[0]]
                .displayText;
            for (let key of Object.keys(
              matchScoutingConfig.timing.timeTransitions[transitions[0]]
                .variables
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
              matchScoutingConfig.timing.timeTransitions[transitions[0]].always
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
          buttons
            .filter((x) => x.type === "match-control")
            .forEach((b) => {
              //update all match-control buttons (even those in different layers)
              b.element.innerText = `${(time / 1000).toFixed(
                2
              )} | ${displayText}`;
            });
        }, 10);
        doExecutables(button);
        updateLastAction();
        updateButtonStates();
      });
    },
  };

  //create button objects in layers
  for (const layer of layers) {
    for (const button of layer) {
      button.element = document.createElement("button");

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

  showLayer(0); //initially show layer 0
  updateButtonStates(); //initially update button states

  function doExecutables(button) {
    for (const executable of button.executables) {
      try {
        executables[executable.type].execute(
          button,
          layers,
          ...executable.args
        );
      } catch (e) {
        console.error(e);
        throw new Error(`Error occured within ${executable.type} executable!`);
      }
    }
  }

  function showLayer(layer, conditional = {}, always = []) {
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

  // Restore button states and last action if inMatch is true
  if (localStorage.getItem("inMatch") === "true") {
    document.querySelector("#form .save").click();
    switchPage("match-scouting");
    const button = buttons
      .find((x) => x.type === "match-control");
    devEnd = () => {
      start = Date.now() - (matchScoutingConfig.timing.totalTime - 1);
    };
    const transitions = Object.keys(
      matchScoutingConfig.timing.timeTransitions
    )
      .map((x) => Number(x))
      .sort((a, b) => b - a);
    timerActive = localStorage.getItem("timerActive") === "true";
    button.timerInterval = setInterval(() => {
      if (time <= transitions[0]) {
        //move to the next transition if it is time
        displayText =
          matchScoutingConfig.timing.timeTransitions[transitions[0]]
            .displayText;
        for (let key of Object.keys(
          matchScoutingConfig.timing.timeTransitions[transitions[0]]
            .variables
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
          matchScoutingConfig.timing.timeTransitions[transitions[0]].always
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
      buttons
        .filter((x) => x.type === "match-control")
        .forEach((b) => {
          //update all match-control buttons (even those in different layers)
          b.element.innerText = `${(time / 1000).toFixed(
            2
          )} | ${displayText}`;
        });
    }, 10);
    updateButtonStates();
    updateLastAction();
  }
})();
