let actionQueue = [];
let devEnd;
let variables = {};
let previousLayers = [];

(async () => {
  config = await config;
  matchScoutingConfig = await matchScoutingConfig;

  const parseBoolean = (value) =>
    value === true || value === "true" || value === "on";
  const enableSwapZoneButtonLocations = parseBoolean(
    config.SWAP_ZONE_BUTTON_LOCATIONS,
  );

  //initiate timing
  let time = matchScoutingConfig.timing.totalTime;
  let teleopTime = 130000;
  const timingTransitions = Object.entries(
    matchScoutingConfig.timing.timeTransitions || {},
  ).map(([transitionTime, transitionData]) => ({
    time: Number(transitionTime),
    ...transitionData,
  }));
  const teleopTransitionTimes = timingTransitions
    .filter((transition) =>
      (transition.displayText || "").toLowerCase().includes("teleop"),
    )
    .map((transition) => transition.time)
    .sort((a, b) => a - b);
  if (teleopTransitionTimes.length > 0) {
    teleopTime = teleopTransitionTimes[0];
  }
  let endgameTime = 30000;
  let shiftSwitchInterval = 25000;
  let timerActive = false;
  let currentShift = ""; // "active" | "inactive"
  let lastShiftSwitchTime = teleopTime;
  let shiftButtonPressed = false;

  // shift counters
  let activeShiftCount = 0;
  let inactiveShiftCount = 0;
  let currentShiftNumber;
  let displayText = "";
  let displayTextWithShift = displayText;

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
  function findLayerIndexByButtonId(buttonId) {
    return layers.findIndex((layer) =>
      layer.some((button) => (button.configId || button.id) === buttonId),
    );
  }

  function findTeleopLayerIndex() {
    const teleopShiftLayerIndex = findLayerIndexByButtonId("teleopActive");
    if (teleopShiftLayerIndex < 0 || !layers[teleopShiftLayerIndex]) {
      return -1;
    }

    const teleopShiftButtons = layers[teleopShiftLayerIndex].filter((button) =>
      ["teleopActive", "teleopInactive"].includes(button.configId || button.id),
    );

    for (const shiftButton of teleopShiftButtons) {
      const layerExecutable = (shiftButton.executables || []).find(
        (executable) =>
          executable.type === "layer" &&
          Array.isArray(executable.args) &&
          executable.args.length >= 2,
      );
      if (layerExecutable) {
        return Number(layerExecutable.args[1]);
      }
    }

    return -1;
  }

  function isSameLayer(renderedLayer, layerIndex) {
    const targetLayer = layers[layerIndex];
    if (!Array.isArray(renderedLayer) || !targetLayer) {
      return false;
    }

    if (renderedLayer.length !== targetLayer.length) {
      return false;
    }

    const renderedIds = renderedLayer
      .map((button) => button.configId || button.id)
      .slice()
      .sort();
    const targetIds = targetLayer
      .map((button) => button.configId || button.id)
      .slice()
      .sort();

    return renderedIds.every((id, index) => id === targetIds[index]);
  }

  const autoTransition = timingTransitions.find((transition) =>
    (transition.displayText || "").toLowerCase().includes("auto"),
  );
  const autoLayerNumber =
    autoTransition && Number.isFinite(Number(autoTransition.layer))
      ? Number(autoTransition.layer)
      : -1;
  const teleopLayerNumber = findTeleopLayerIndex();

  function getCurrentAllianceColor() {
    if (!ScoutingSync || !ScoutingSync.matches) return null;

    const currentMatch = ScoutingSync.matches.find(
      (match) =>
        String(match.number) === String(ScoutingSync.state.matchNumber),
    );
    if (!currentMatch || !currentMatch.robots) return null;

    const robotNumber = String(ScoutingSync.state.robotNumber);
    const redRobots = (currentMatch.robots.red || []).map(String);
    const blueRobots = (currentMatch.robots.blue || []).map(String);

    if (redRobots.includes(robotNumber)) return "red";
    if (blueRobots.includes(robotNumber)) return "blue";
    return null;
  }

  function applyButtonVisuals(
    button,
    displayText,
    className,
    gridArea,
    buttonId,
  ) {
    button.id = buttonId;
    button.displayText = displayText;
    button.class = className;
    button.gridArea = [...gridArea];

    button.element.innerText = displayText;
    button.element.className = "grid-button";
    for (const classPart of className.split(" ")) {
      if (classPart) {
        button.element.classList.add(classPart);
      }
    }
    button.element.style.gridArea = gridArea.join(" / ");
  }

  function applyZoneButtonPreferences() {
    for (const layer of layers) {
      const aZoneButton = layer.find((button) => button.configId === "AZone");
      const oaZoneButton = layer.find((button) => button.configId === "OAZone");
      if (!aZoneButton || !oaZoneButton) continue;

      let aZoneDisplayText = aZoneButton.originalDisplayText;
      let oaZoneDisplayText = oaZoneButton.originalDisplayText;
      let aZoneClass = aZoneButton.originalClass;
      let oaZoneClass = oaZoneButton.originalClass;
      let aZoneGridArea = [...aZoneButton.originalGridArea];
      let oaZoneGridArea = [...oaZoneButton.originalGridArea];
      let aZoneId = aZoneButton.configId;
      let oaZoneId = oaZoneButton.configId;

      if (enableSwapZoneButtonLocations) {
        [aZoneGridArea, oaZoneGridArea] = [oaZoneGridArea, aZoneGridArea];
      }
      if (getCurrentAllianceColor() === "blue") {
        [aZoneId, oaZoneId] = [oaZoneId, aZoneId];
        [aZoneDisplayText, oaZoneDisplayText] = [
          oaZoneDisplayText,
          aZoneDisplayText,
        ];
      }

      applyButtonVisuals(
        aZoneButton,
        aZoneDisplayText,
        aZoneClass,
        aZoneGridArea,
        aZoneId,
      );
      applyButtonVisuals(
        oaZoneButton,
        oaZoneDisplayText,
        oaZoneClass,
        oaZoneGridArea,
        oaZoneId,
      );
    }
  }

  const buttonBuilders = {
    //an object to give buttons type specific things, button type: function (button)
    action: (button) => {
      button.element.addEventListener("click", () => {
        let shift = camelCase(displayTextWithShift);
        let actionId = `${shift.replace(" ", "")}${button.id}`;

        actionQueue.push({
          id: actionId,
          baseId: button.id,
          ts: time,
        });

        doExecutables(button);
        updateLastAction();
      });
    },
    undo: (button) => {
      button.element.addEventListener("click", () => {
        /* Only allow undoing if the action queue has more entries than the minimum protected length.
         * minOfQueueLength guards the initial "start match" entry so the timer cannot be undone
         * once scouting is in progress (unless the match-control special case below applies).
         */
        if (
          actionQueue.length > matchScoutingConfig.variables.minOfQueueLength
        ) {
          // Basically, if this code was not in place (^), then you would be able to undo the start of the game.

          /* Pop the most-recently recorded action and look up the button object that produced it.
           * undoneAction has the action id, its original button id (baseId), and the timestamp (ts).
           */
          const undoneAction = actionQueue.pop(); //remove the last action from the action queue
          // Resolve baseId back to the live button object so we can access its type and executables.
          const undoneButton = buttons.find(
            (x) => x.id === undoneAction.baseId,
          );

          /* Special case: undoing the "Start Match" button requires resetting all timer state
           * because match-control buttons manage the interval directly and have no executable to reverse.
           * special case for match-control buttons which have extra undo funcitonality without executables
           */
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

          /*
           * Dynamic layer correction: if we are currently in teleop (time < teleopTime) and both
           * auto and teleop layer indices are known, scan the previousLayers history and replace any
           * stored auto-layer snapshots with the teleop layer. Makes sure that if a layer-switch
           * action is undone during teleop, the layer history reflects teleop rather than auto.
           */
          if (
            time < teleopTime &&
            autoLayerNumber >= 0 &&
            teleopLayerNumber >= 0
          ) {
            for (let i = 0; i < previousLayers.length; i++) {
              if (isSameLayer(previousLayers[i], autoLayerNumber)) {
                previousLayers[i] = [...layers[teleopLayerNumber]];
              }
            }
          }

          /*
           * If the earliest recorded layer snapshot is the teleop layer, restore it so the UI
           * returns to the correct teleop button set after the undo.
           */
          if (
            teleopLayerNumber >= 0 &&
            isSameLayer(previousLayers[0], teleopLayerNumber)
          ) {
            showLayer(teleopLayerNumber);
          }
          /*
           * Reverse each executable that was originally triggered by the undone button.
           * Each executable type exposes a .reverse() method that mirrors what .execute() did
           * (e.g. popping a layer off the stack, toggling a variable back to its previous value).
           */
          for (const executable of undoneButton.executables) {
            executables[executable.type].reverse(
              undoneButton,
              layers,
              ...executable.args,
            ); //reverse any executables associated with the undone button
          }
        }
        /*
         * Always run the undo button's own executables (e.g. to pop the previousLayers stack
         * and re-display the correct layer regardless of whether an action was actually undone).
         */
        doExecutables(button, time);
        updateLastAction();
      });
    },

    none: (button) => {
      //add a temporary event to the action queue with no id which will be removed before the action queue is sent
      button.element.addEventListener("click", () => {
        actionQueue.push({
          id: button.id,
          baseId: button.id,
          ts: time,
          temp: true,
        });
        if (button.id === "teleopActive") {
          currentShift = "active";

          activeShiftCount += 1;
          currentShiftNumber = activeShiftCount;
          lastShiftSwitchTime = time;
          shiftButtonPressed = true;
        } else if (button.id === "teleopInactive") {
          currentShift = "inactive";
          inactiveShiftCount += 1;
          currentShiftNumber = inactiveShiftCount;
          lastShiftSwitchTime = time;

          shiftButtonPressed = true;
        }
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
          baseId: button.id,
          ts: time,
          temp: true,
        });

        ScoutingSync.updateState({
          status: ScoutingSync.SCOUTER_STATUS.SCOUTING,
        }); //tell the server that you started scouting

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
          let elapsedSinceSwitch = Math.abs(time - lastShiftSwitchTime);
          // Handle shift switching during teleop (between teleopTime and endgameTime)
          // Only switch if a shift button has been pressed
          if (shiftButtonPressed && elapsedSinceSwitch >= shiftSwitchInterval) {
            if (currentShift === "active") {
              currentShift = "inactive";

              inactiveShiftCount += 1;
              currentShiftNumber = inactiveShiftCount;
            } else {
              currentShift = "active";
              activeShiftCount += 1;
              currentShiftNumber = activeShiftCount;
            }

            lastShiftSwitchTime = time;
          }

          // Build display text with shift information

          if (time > teleopTime) {
            displayTextWithShift = `${displayText}`;
          } else if (time < teleopTime && time > endgameTime) {
            if (shiftButtonPressed) {
              const shiftDisplay =
                currentShift === "active"
                  ? `Active Shift ${currentShiftNumber}`
                  : `Inactive Shift ${currentShiftNumber}`;

              displayTextWithShift = shiftDisplay;
            } else {
              displayTextWithShift = `${displayText}`;
            }
          } else if (time <= endgameTime) {
            displayTextWithShift = `Endgame`;
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
      button.id = button.id || "";
      button.configId = button.id;
      button.originalDisplayText = button.displayText || button.id;
      button.originalClass = button.class;
      button.originalGridArea = [...button.gridArea];
      button.element = document.createElement("div");

      //give the button element its properties
      button.element.innerText = button.displayText || button.id;
      button.element.classList.add("grid-button", ...button.class.split(" "));
      button.element.style.gridArea = button.gridArea.join(" / ");

      //apply type to button+
      buttonBuilders[button.type](button);
      //add the button to the grid
      grid.appendChild(button.element);
    }
  }

  applyZoneButtonPreferences();
  window.addEventListener("spot:scouting-state-updated", () => {
    applyZoneButtonPreferences();
  });

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
      let renderedButtons = [];
      for (let button of layers[layer]) {
        const configButtonId = button.configId || button.id;
        let thingsToCheck = {};
        for (let [variable, valueData] of Object.entries(conditional)) {
          for (let [value, idList] of Object.entries(valueData)) {
            if (idList.includes(configButtonId)) {
              if (thingsToCheck[variable]) {
                thingsToCheck[variable].push(value);
              } else {
                thingsToCheck[variable] = [value];
              }
            }
          }
        }

        let display = false;
        for (let [variable, values] of Object.entries(thingsToCheck)) {
          if (values.includes(variables[variable].current)) {
            display = true;
          }
        }

        if (always.includes(configButtonId) || display) {
          button.element.style.display = "flex";
          renderedButtons.push(button);
        }
      }
      previousLayers.push(renderedButtons);
    } else {
      let rendered = [];
      for (const b of layers[layer]) {
        b.element.style.display = "flex";
        rendered.push(b);
      }
      previousLayers.push(rendered);
    }
  }

  function camelCase(str) {
    return str
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
      .replace(/^[A-Z]/, (c) => c.toLowerCase());
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
