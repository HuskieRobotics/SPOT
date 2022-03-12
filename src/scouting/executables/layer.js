/**
 * Shows another layer on button press
 * @param fromLayer the layer number the executable is transitioning from (normally the layer which contains the button)
 * @param toLayer the layer which the executable is transitioning to (the layer that will be shown).
 */
executables["layer"] = {
    execute(button,layers,fromLayer,toLayer) {
        for (let button of layers.flat()) { //hide all buttons
            button.element.style.display = "none"
        }
        for (let button of layers[toLayer]) {
            button.element.style.display = "flex"
        }
    },
    reverse(button,layers,fromLayer,toLayer) {
        for (let button of layers.flat()) { //hide all buttons
            button.element.style.display = "none"
        }
        for (let button of layers[fromLayer]) {
            button.element.style.display = "flex"
        }
    }
}