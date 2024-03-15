let exists;
let submitButton;

async function onScanSuccess(qrCodeMessage) {
    const data = await decodeQRCodeUrl(qrCodeMessage);

    if (submitButton) {
        document.body.removeChild(submitButton);
    }

    submitButton = document.createElement('button');
    submitButton.classList.add('qr-button');
    submitButton.textContent = 'Data is Correct (Submit/Cache)';
    exists = true;

    let html = `Timestamp: ${data.timestamp}<br>Client Version: ${data.clientVersion}<br>Scouter ID: ${data.scouterId}`;
    html += `<br>Event Number: ${data.eventNumber}<br>Match Number: ${data.matchNumber}<br>Robot Number: ${data.robotNumber}<br>Action Queue: [<br></p>`;
    for (const action of data.actionQueue) {
        html += `{ id: '${action.id}', ts: ${action.ts} }<br>`
    }
    html += ']';

    const result = document.getElementById('result');

    document.body.insertBefore(submitButton, result);

    document.getElementById('result').innerHTML = html;

    submitButton.addEventListener("click", async () => {
        const response = await (await fetch("./api/teamMatchPerformance", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data),
        }));
        const teamMatchPerformances = []

            if (response.ok){
                let teamMatchPerformances = localStorage.getItem('teamMatchPerformances');
                if (teamMatchPerformances) {
                    teamMatchPerformances = JSON.parse(teamMatchPerformances);
                } else {
                    teamMatchPerformances = [];
                }
                let newPerformance = JSON.stringify(data);
                if (!teamMatchPerformances.includes(newPerformance)) {
                    // If not, add it to the cache
                    teamMatchPerformances.push(newPerformance);
                    localStorage.setItem('teamMatchPerformances', JSON.stringify(teamMatchPerformances));
                    console.log(localStorage.getItem('teamMatchPerformances'));
                }
                
            } 
            else if (localStorage.getItem('teamMatchPerformances') == null){
                for(let i = 0; i < teamMatchPerformances.length; i++) {
                    if (teamMatchPerformances[i] !== JSON.stringify(data)) {
                        teamMatchPerformances.push(JSON.stringify(data));
                    }
                }
                localStorage.setItem('teamMatchPerformances', teamMatchPerformances);
                console.log(localStorage.getItem('teamMatchPerformances'));
            }
        });
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
        actionQueue: []
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