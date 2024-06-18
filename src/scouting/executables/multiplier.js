executables["multiplier"] = {
  execute(button, layers, numActions) {
    if (button.type != "action") {
      console.warn(
        "The 'multiplier' executable should only be used with 'action' buttons! Using it with buttons of other types can lead to unexpected results."
      );
    }

    //add numActions-1 actions to the action queue
    for (let i = 0; i < numActions - 1; i++) {
      actionQueue.push({
        id: button.id,
        ts: actionQueue[actionQueue.length - 1].ts, //get the time from the last action (the one created by the initial button press)
      });
    }
  },
  reverse(button, layers, numActions) {
    //add numActions-1 actions to the action queue
    for (let i = 0; i < numActions - 1; i++) {
      actionQueue.pop();
    }
  },
};
