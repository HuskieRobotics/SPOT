# Config Info

## client.json
`client.json` includes all of the information that encompasses a scouting app's basic frontend and data collection.

- `gameId`: A unique identifier for the current year's game. This is separate from version. 
- `version`: A string identifying the scouting frontend's version.
- `tbaEventKey`: A TheBlueAlliance event key corresponding to the event.
- `eventNumber`: An event number, used to differentiate teamMatchPerformances between different events.
- `timing`
    - `totalTime`: The total amount of time in a game in seconds.
    - `timeTransitions`: An object with keys being numbers (in the JSON as a string) denoting the start of a time-based layer transition (see `layers`).
- `layout`: the layout of a scouting app's main grid.
    - `gridRows`: The number of rows in the scouting app's main grid.
    - `gridColumns`: The number of columns in the scouting app's main grid.
    - `layers`: A layer is an array of objects representing each button of the scouting app visible in a layer. By default, the layer at index 0 of layers is shown, but this can be changed through `timing`, or by `executables` triggered by a button press.
        - `id`: A unique identifier string for the button that represents a scouting action
        - `gridArea`: An array of four strings representing each element of a CSS grid-area attribute that will be applied to the button (ex. `0 / 1 / 1 / 2` becomes `["0","1","1","2"]`)
        - `class`: A CSS class to be applied to the button.
        - `type`: A string representing the type of scouting action the button represents.
            1. `"action"`: When pressed, add a robot action to the action queue (eg. score, climb) and run any executables if applicable.
            2. `"undo"`: When pressed, remove the last action from the action queue and run any executables if applicable.
            3. `"none"`: When pressed, run any executables if applicable without modifying the action queue.
        - `executables`: An array of objects representing custom tasks executed when the button is pressed beyond those specified by their type.
            - `type`: Name of an executable function.
            - `args`: A static array of arguments passed into the executable function.
            