const result = document.getElementById('result');

// Declare variables for submit and undo buttons
const submitButton = document.getElementById('submit');
const undoButton = document.getElementById('undo');

let previousEvent;
let previousUndoEvent;

// Function that is called when a QR code is successfully scanned
async function onScanSuccess(qrCodeMessage) {
    // Decode the QR code URL to get the data
    const data = await decodeQRCodeUrl(qrCodeMessage);

   result.innerHTML = '';

   const labels = [];

    const timestamp = document.createElement('p');
    timestamp.innerHTML = `<b>Timestamp: </b>${data.timestamp}`;
    labels.push(timestamp);

    const clientVersion = document.createElement('p');
    clientVersion.innerHTML = `<b>Client Version: </b>${data.clientVersion}`;
    labels.push(clientVersion);

    const scouterId = document.createElement('p');
    scouterId.innerHTML = `<b>Scouter ID: </b>${data.scouterId}`;
    labels.push(scouterId);

    const eventNumber = document.createElement('p');
    eventNumber.innerHTML = `<b>Event Number: </b>${data.eventNumber}`;
    labels.push(eventNumber);

    const matchNumber = document.createElement('p');
    matchNumber.innerHTML = `<b>Match Number: </b>${data.matchNumber}`;
    labels.push(matchNumber);

    const robotNumber = document.createElement('p');
    robotNumber.innerHTML = `<b>Robot Number: </b>${data.robotNumber}`;
    labels.push(robotNumber);

    for (const label of labels) {
        label.className = 'result-text';
        result.appendChild(label);
    }

    const divider = document.createElement('div');
    divider.className = 'result-divider';
    result.appendChild(divider);

    const queue = document.createElement('p');
    queue.innerHTML = `<b>Action Queue</b>`;
    result.appendChild(queue);

    for (const action of data.actionQueue) {
        const div = document.createElement('div');
        div.className = 'action-queue';

        const id = document.createElement('p');
        id.innerHTML = `<b>ID: </b>${action.id}`;

        const ts = document.createElement('p');
        ts.innerHTML = `<b>TS: </b>${action.ts}`;

        div.appendChild(id);
        div.appendChild(ts);

        result.appendChild(div);
    }

    // Add an event listener to the submit button that sends a POST request when clicked
    const event = async () => {
        console.log('Attempting to submit');
        let response;
        try {
            response = await (await fetch("./api/teamMatchPerformance", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(data),
            }));
        } catch (err) {
            response = {}.ok = false;
        }

        // If the response from the POST request is OK, add an event listener to the undo button
        if (response.ok) {
            console.log('Successfully uploaded scouting data to database');
            // Create a new div element for the notification
            let notification = document.createElement('div');
            notification.textContent = 'Successfully uploaded scouting data to database';
            notification.style.position = 'fixed';
            notification.style.top = '20px';
            notification.style.left = '50%';
            notification.style.transform = 'translateX(-50%)';
            notification.style.padding = '10px';
            notification.style.backgroundColor = '#4CAF50';
            notification.style.color = 'white';
            notification.style.borderRadius = '5px'; // Add this for a similar style to the rest of the buttons

            // Append the notification to the body
            document.body.appendChild(notification);

            // Set a timeout to remove the notification after 3 seconds
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 3000);
            const undoEvent = async () => {
                const res = await (await fetch("./api/undo", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                }));

                if (res.ok) {
                    console.log('Successfully removed previous TMP from database');
                } else {
                    console.log('Failed to removed previous TMP from database');
                }
            }

            if (previousUndoEvent) {
                undoButton.removeEventListener('click', previousUndoEvent);
            }

            // DATABASE UNDO IMPLEMENTATION
            undoButton.addEventListener('click', undoEvent);

                        previousUndoEvent = undoEvent;

        // If saving to the database fails for whatever reason, store it in local storage for later usage
        } else {
            console.log('Failed to connect to database, storing TMP data in cache');
            // Create a new div element for the notification
            let notification = document.createElement('div');
            notification.textContent = 'Failed to connect to database, storing TMP data in cache';
            notification.style.position = 'fixed';
            notification.style.bottom = '20px';
            notification.style.right = '20px';
            notification.style.padding = '10px';
            notification.style.backgroundColor = '#4CAF50';
            notification.style.color = 'white';
            notification.style.borderRadius = '5px'; // Add this for a similar style to the rest of the buttons

            // Append the notification to the body
            document.body.appendChild(notification);

            // Set a timeout to remove the notification after 3 seconds
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 3000);
            let teamMatchPerformances = localStorage.getItem('teamMatchPerformances');
            if (teamMatchPerformances) {
                teamMatchPerformances = JSON.parse(teamMatchPerformances);
            } else {
                teamMatchPerformances = [];
            }
            let newPerformance = JSON.stringify(data);
            if (!teamMatchPerformances.includes(newPerformance)) {
                //If not, add it to the cache
                teamMatchPerformances.push(newPerformance);
                localStorage.setItem('teamMatchPerformances', JSON.stringify(teamMatchPerformances))

                // Create a new div element for the notification
                let notification = document.createElement('div');
                notification.textContent = 'Data has been successfully stored in cache';
                notification.style.position = 'fixed';
                notification.style.top = '20px';
                notification.style.left = '50%';
                notification.style.transform = 'translateX(-50%)';
                notification.style.padding = '10px';
                notification.style.backgroundColor = '#4CAF50';
                notification.style.color = 'white';
                notification.style.borderRadius = '5px'; // Add this for a similar style to the rest of the buttons

                // Append the notification to the body
                document.body.appendChild(notification);

                // Set a timeout to remove the notification after 3 seconds
                setTimeout(() => {
                    document.body.removeChild(notification);
                }, 3000);

                console.log(localStorage.getItem('teamMatchPerformances'));
            }

            const undoEvent = () => {
                let teamMatchPerformances = localStorage.getItem('teamMatchPerformances');
                if (teamMatchPerformances) {
                    teamMatchPerformances = JSON.parse(teamMatchPerformances);
                    // Remove the most recent entry
                    teamMatchPerformances.pop();
                    // Store the modified array back in the cache
                    localStorage.setItem('teamMatchPerformances', JSON.stringify(teamMatchPerformances));
                    console.log(localStorage.getItem('teamMatchPerformances'));  
                    // Create a new div element for the notification
                    let notification = document.createElement('div');
                    notification.textContent = 'Data has been successfully removed from cache';
                    notification.style.position = 'fixed';
                    notification.style.top = '20px';
                    notification.style.left = '50%';
                    notification.style.transform = 'translateX(-50%)';
                    notification.style.padding = '10px';
                    notification.style.backgroundColor = '#4CAF50';
                    notification.style.color = 'white';
                    notification.style.borderRadius = '5px'; // Add this for a similar style to the rest of the buttons

                    // Append the notification to the body
                    document.body.appendChild(notification);

                    // Set a timeout to remove the notification after 3 seconds
                    setTimeout(() => {
                        document.body.removeChild(notification);
                    }, 3000);
                } else {
                    console.log('No entries to delete.');
                }
            }

            if (previousUndoEvent) {
                undoButton.removeEventListener('click', previousUndoEvent);
            }

            // CACHE UNDO IMPLEMENTATION
            undoButton.addEventListener('click', undoEvent);

            previousUndoEvent = undoEvent;
        }
    }

    if (previousEvent) {
        submitButton.removeEventListener('click', previousEvent);
    }

    submitButton.addEventListener("click", event);

    previousEvent = event;
}

function onScanError(errorMessage) {

}

var html5QrcodeScanner = new Html5QrcodeScanner(
    "reader", { fps: 30, qrbox: 250 });
html5QrcodeScanner.render(onScanSuccess, onScanError);

function decodeData(encodedData) {
    const decodedData = new Uint8ClampedArray(Array.from(atob(encodedData), (char) => {
        return char.charCodeAt(0);
    }));

    return decodedData;
}

function generateIdEnum(buttons) {
    let ids = [];
    
    for (let button of buttons) {
        if (!ids.includes(button.id)) ids.push(button.id);
    }

    let idEnum = {};
    for (let [index,id] of ids.entries()) {
        idEnum[id] = index
    }
    return idEnum;
}

async function decodeQRCodeUrl(image_url) {
    const qrConfig = await fetch("/config/qr.json").then(res => res.json());
    const scoutingConfig = await fetch("/config/match-scouting.json").then(res => res.json());
    const ACTION_SCHEMA = qrConfig.ACTION_SCHEMA;

    this.ID_ENUM = generateIdEnum(scoutingConfig.layout.layers.flat());
    const ID_ENUM_REVERSE = Object.assign({}, ...Object.entries(this.ID_ENUM).map(([key,index]) => ({ [index]: key })));

   let bytes = decodeData(image_url);
   let bits = bytes.reduce((acc, x) => acc+x.toString(2).padStart(8, "0"), "");
   // console.log("hex bytes", bytes.map(x=>x.toString(16)));

    //parse bits
    let matchInfo = bits.slice(0,112);
    let actionQueueBits = bits.slice(112);

    let teamMatchPerformance = {
        timestamp: Date.now(),
        clientVersion: `${parseInt(matchInfo.slice(0,8),2)}.${parseInt(matchInfo.slice(8,16),2)}`, //major.minor
        scouterId: "qrcode",
        eventNumber: parseInt(bits.slice(16,24),2),
        matchNumber: String(parseInt(bits.slice(24,32),2)),
        robotNumber: String(parseInt(bits.slice(32,48),2)),
        matchId_rand: parseInt(bits.slice(48,112),2).toString(32),
        actionQueue: [],
    };
    
    teamMatchPerformance.matchId = `${teamMatchPerformance.matchNumber}-${teamMatchPerformance.robotNumber}-${teamMatchPerformance.scouterId}-${teamMatchPerformance.matchId_rand}`;

    let actionSize = ACTION_SCHEMA.reduce((acc,x) => acc+x.bits, 0);
    
    let nextAction = actionQueueBits.slice(0,actionSize);
    actionQueueBits = actionQueueBits.slice(actionSize);

    while (nextAction.slice(0,8) != "11111111") {
        let action = {};
        
        for (let {key,bits} of ACTION_SCHEMA) {
            if (key == "id") {
                action[key] = ID_ENUM_REVERSE[parseInt(nextAction.slice(0,bits),2)];
            } else {
                action[key] = parseInt(nextAction.slice(0,bits),2);
                nextAction = nextAction.slice(bits);
            }

        }
        teamMatchPerformance.actionQueue.push(action);
        nextAction = actionQueueBits.slice(0,actionSize);
        actionQueueBits = actionQueueBits.slice(actionSize);
    }
    
    return teamMatchPerformance;     
}