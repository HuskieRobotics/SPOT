executables["constantPosition"] = {
    execute(button, layers, position) {
        //add the constant position to the action
        actionQueue[actionQueue.length - 1].pos = position;
},
    reverse(button, layers, args) {
        //nothing to undo
    }
}