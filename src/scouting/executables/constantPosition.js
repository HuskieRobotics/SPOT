executables["constantPosition"] = {
    execute(button, layers,time, position) {
        //add the constant position to the action
        if (!actionQueue[actionQueue.length - 1].other) actionQueue[actionQueue.length - 1].other = {}
        actionQueue[actionQueue.length - 1].other.pos = position;

},
    reverse(button, layers,time, args) {
        //nothing to undo
    }
}