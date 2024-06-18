executables["constantPosition"] = {
  execute(button, layers, position) {
    //add the constant position to the action
    if (!actionQueue[actionQueue.length - 1].other)
      actionQueue[actionQueue.length - 1].other = {};
    actionQueue[actionQueue.length - 1].other.pos = position;
  },
  reverse(button, layers, args) {
    //nothing to undo
  },
};
