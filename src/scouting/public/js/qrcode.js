class QREncoder {
    initialized;
    ACTION_SCHEMA;
    ID_ENUM;
    ID_ENUM_REVERSE;
    
    constructor() {
        this.initialized = false;
    }

    async init() {
        if (this.initialized) {
            return;
        }
        
        qrConfig = await qrConfig;

        this.ACTION_SCHEMA = qrConfig.ACTION_SCHEMA;
        const scoutingConfig = await matchScoutingConfig;
        this.ID_ENUM = QREncoder.generateIdEnum(scoutingConfig.layout.layers.flat());
        this.ID_ENUM_REVERSE = Object.assign({}, ...Object.entries(this.ID_ENUM).map(([key,index]) => ({ [index]: key })));

        this.initialized = true;
    }

    static generateIdEnum(buttons) {
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

    static encodeValue(val, max, min, bits) {
        if (val > max || val < min) throw new Error("value is outside of provided max and min")
        return val.toString(2).padStart(bits,"0");
    }

    /**
     * 
     * @returns should pop up a qr code that can be scanned by the decoder
     * all the data is stored in local data 
     * button that pops up a new tab with a list of matches scored (should be on starting page)
     * clicking on the match pops up qr code 
     */
    async encodeTeamMatchPerformance(teamMatchPerformance) {
        // This code isn't needed to encode the team's match performance

        await this.init();

        let out = "" //store everything in strings. This is inefficient, but I haven't found a better way to do this in browser js and it probably doesnt matter.

        /****** Match Info (80 bits) ******/
        let [majorVersion,minorVersion] = teamMatchPerformance.clientVersion.split(".").map(x => parseInt(x));
        
        out += QREncoder.encodeValue(majorVersion, 255, 0, 8); // major version (8 bits)
        out += QREncoder.encodeValue(minorVersion, 255, 0, 8); // minor version (8 bits)
        out += QREncoder.encodeValue(teamMatchPerformance.eventNumber, 255, 0, 8) //event number (8 bits)
        out += QREncoder.encodeValue(parseInt(teamMatchPerformance.matchNumber), 255, 0, 8) // match number (8 bits)
        out += QREncoder.encodeValue(parseInt(teamMatchPerformance.robotNumber), 65535, 0, 16) // team number (16 bits)
        // out += QREncoder.encodeValue(parseInt(teamMatchPerformance.matchId_rand,"32"),2 ** 32 - 1, 0, 32); // matchId_rand (32 bits)
        out += QREncoder.encodeValue(parseInt(teamMatchPerformance.matchId_rand,"32"),2 ** 64 - 1, 0, 32); // matchId_rand (64 bits)

        /****** Action Queue ******/
        for (let action of teamMatchPerformance.actionQueue) {
            //action's values are defined by the ACTION_SCHEMA in qr.json
            for (let {key,bits} of this.ACTION_SCHEMA) {
                if (key == "id") {
                    out += QREncoder.encodeValue(this.ID_ENUM[getVal(action,key)], 2 ** bits - 2, 0, bits) //254 max unique ids, probably enough for 99.9% of scouting apps
                } else {
                    out += QREncoder.encodeValue(parseInt(getVal(action,key)), 2 ** bits - 1, 0, bits)
                }
                //encode the value parseInt'd to allow for strings that contain an integer number. max is 2^bits - 2 for id and 2^bits - 1 for all other numbers as an action of 2^(total bits)-1 indicates the end of the action queue
            }
        }

        console.log(out);

        out += "11111111" //filled byte to signify the end of the action queue
        console.log("hex bytes", out.match(/.{1,8}/g).map(x=>parseInt(x,2).toString(16)));

        const data = out.match(/.{1,8}/g).map(x=>parseInt(x, 2));
        console.log(`Data: ${data}`);
        const dataUintArray = new Uint8ClampedArray(data);
        console.log(`Uint Array: ${dataUintArray}`);

        const dataAsString = btoa(String.fromCharCode.apply(null, dataUintArray));

        console.log(`Data String: ${dataAsString}`)

        let dataUrl;
        await QRCode.toDataURL(dataAsString, {
            errorCorrectionLevel: "M",
        }, (err, url) => {
            if (err) {
                console.log(err);
            }

            dataUrl = url;
        })
        
        /*
        let dataUrl = await QRCode.toDataURL([{
            data: new Uint8ClampedArray(out.match(/.{1,8}/g).map(x=>parseInt(x,2))), 
            mode: "byte"
        }], {
            errorCorrectionLevel: "L", 
        });
        */

        /*
        const data = JSON.stringify(teamMatchPerformance);

        let dataUrl;
        await QRCode.toDataURL(data, {
            errorCorrectionLevel: "M",
        }, (err, url) => {
            if (err) {
                console.log(err);
            }
            dataUrl = url;
        });
        */

        let qrContainer = document.createElement("div");
        let qrText = document.createElement("div");
        let qrImg = document.createElement("img");

        qrContainer.classList.add("qr-container");
        qrText.classList.add("qr-text");
        qrImg.classList.add("qr-img");

        qrImg.src = dataUrl;
        qrText.innerText = "Tap to Dismiss";

        qrContainer.appendChild(qrImg);
        qrContainer.appendChild(qrText);
        document.body.appendChild(qrContainer);

        qrContainer.addEventListener("click", () => {
            document.body.removeChild(qrContainer);
        })

        return dataUrl;
    }
}

function getVal(obj,path) {
    if (path === "") return obj
    path = path.split(".");
    return getVal(obj[path.shift()],path.join("."));
}

/**
 * in admin a button called scan qr code should be added
 * when opened it should open a camera view that can scan and decode qr codes 
 * after a qr code is found a snap shot should be taken and the admins hould be able to confirm the qr code
 * then once you have the tmp it can be added like any ohter tmp to the database 
 */
/* decoder, move this to admin
async function decodeQRCodeUrl(image_url) {
    let img = new Image();
    let canvas = document.createElement("canvas");
    await new Promise(r => img.onload=r, img.src=image_url);

    canvas.width = img.width;
    canvas.height = img.height;

    let ctx = canvas.getContext("2d");
    ctx.drawImage(img,0,0);
    let imageData = ctx.getImageData(0,0,img.width,img.height);
    
    let bytes = jsQR(imageData.data, imageData.width, imageData.height).binaryData;
    let bits = bytes.reduce((acc,x) => acc+x.toString(2).padStart(8,"0"),"")
    console.log("hex bytes", bytes.map(x=>x.toString(16)))

    //parse bits
    let matchInfo = bits.slice(0,80);
    let actionQueueBits = bits.slice(80);

    console.log(matchInfo)
    let teamMatchPerformance = {
        timestamp: Date.now(),
        clientVersion: `${parseInt(matchInfo.slice(0,8),2)}.${parseInt(matchInfo.slice(8,16),2)}`, //major.minor
        scouterId: "qrcode",
        eventNumber: parseInt(bits.slice(16,24),2),
        matchNumber: String(parseInt(bits.slice(24,32),2)),
        robotNumber: String(parseInt(bits.slice(32,48),2)),
        matchId_rand: parseInt(bits.slice(48,80),2).toString(32),
        actionQueue: []
    };
    teamMatchPerformance.matchId = `${teamMatchPerformance.eventNumber}-${teamMatchPerformance.matchNumber}-${teamMatchPerformance.robotNumber}-${teamMatchPerformance.matchId_rand}`;
    
    let actionSize = ACTION_SCHEMA.reduce((acc,x) => acc+x.bits, 0);
    
    let nextAction = actionQueueBits.slice(0,actionSize);
    actionQueueBits = actionQueueBits.slice(actionSize)
    
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
        actionQueueBits = actionQueueBits.slice(actionSize)
    }

    
    return teamMatchPerformance;     
}
*/