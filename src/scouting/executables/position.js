/*
 * when the button is pressed, this executable collects position data from the user using a field map (src/scouting/public/img/field.png). 
 * That data is then attached to the action in the "other.pos" field as percentages of an axis length (eg. action.other.pos = {x:0,y:0})
 */

let positionConfig = {
    POSITION_LOCK_DELAY_MS: 1000,
    LOCK_BORDER_COLOR: "#00ffa5"
}


let lockedPosition;
let lockedTime;

executables["position"] = {
    execute(button, layers) {
        //position lock check
        if (lockedTime + positionConfig.POSITION_LOCK_DELAY_MS > Date.now()) { // if there's a position in lockedPosition, put it in the action.
            if (!actionQueue[actionQueue.length - 1].other) actionQueue[actionQueue.length - 1].other = {}
            actionQueue[actionQueue.length - 1].other.pos = lockedPosition;

            //set the border color and position lock time
            setAllButtonBorders(layers, positionConfig.LOCK_BORDER_COLOR);
            setTimeout(() => {
                if (lockedTime + positionConfig.POSITION_LOCK_DELAY_MS <= Date.now() + 10) setAllButtonBorders(layers, "transparent");
            }, positionConfig.POSITION_LOCK_DELAY_MS)
            lockedTime = Date.now();
            return;
        }
        //when the button is pressed, do this
        const positionContainer = document.createElement("div");
        positionContainer.style.cssText = `
            width: 100vw;
            height: 100vh;
            position: absolute;
            top: 0;
            left: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            background-color: white;
        `
        const positionImage = new Image();
        positionImage.src = "/img/field.svg";
        positionImage.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: contain;
            background-color: black;
        `
        positionContainer.appendChild(positionImage);
        document.body.appendChild(positionContainer);

        positionImage.addEventListener("click", (e) => {
            /* position gathering */

            //find image width/height and margin offsets
            let aspectRatio = positionImage.naturalWidth / positionImage.naturalHeight;
            let width = positionImage.height * aspectRatio;
            let height = positionImage.height;
            if (width > positionImage.width) {
                width = positionImage.width;
                height = positionImage.width / aspectRatio;
            }

            let marginX = (window.innerWidth - width) / 2;
            let marginY = (window.innerHeight - height) / 2;

            //find click/tap coordinates in terms of % of x and % of y
            let x = (e.offsetX - marginX) / width * 100;
            let y = (e.offsetY - marginY) / height * 100;

            //make x and y an integer between 0 and 100
            x = Math.round(Math.max(Math.min(x, 100), 0));
            y = Math.round(Math.max(Math.min(y, 100), 0));

            //add the pos to the last action of the action queue (SHOULD be the action from the button that triggered this)
            if (!actionQueue[actionQueue.length - 1].other) actionQueue[actionQueue.length - 1].other = {}
            let pos = actionQueue[actionQueue.length - 1].other.pos = {x, y};

            /* position lock */
            if (positionConfig.POSITION_LOCK_DELAY_MS != 0) { //position lock is enabled,
                lockedTime = Date.now();
                lockedPosition = pos;
                setAllButtonBorders(layers, positionConfig.LOCK_BORDER_COLOR);
                setTimeout(() => {
                    if (lockedTime + positionConfig.POSITION_LOCK_DELAY_MS <= Date.now() + 10) setAllButtonBorders(layers, "transparent");
                }, positionConfig.POSITION_LOCK_DELAY_MS)
            }

            //remove the position image + container from DOM.
            document.body.removeChild(positionContainer);
        })
    },
    reverse(button, layers) {
        //nothing to do on reverse, but the function needs to be there
    }
}

function setAllButtonBorders(layers, color) {
    for (let button of layers.flat()) {
        if (button.executables.filter(x => x.type == "position").length > 0) { //it has a position executable
            button.element.style.border = `0.5vw solid ${color}`;
        }
    }
}