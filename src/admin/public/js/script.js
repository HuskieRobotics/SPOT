const SCOUTER_STATUS = {
    "NEW": 0, //scouters who have connected but have not sent their state data
    "WAITING": 1, //scouters not actively in the process of scouting (dont have the scouting ui open)
    "SCOUTING": 2, //scouters actively scouting a match
    "COMPLETE": 3,
}
const SCOUTER_STATUS_REVERSE = {
    "0": "NEW",
    "1": "WAITING",
    "2": "SCOUTING",
    "3": "COMPLETE"
}

const scouters = {};

async function fetchScouters() { //scouter fetch interval (every 2.5s)
    let scouterList = await (await fetch("./api/scouters")).json();
    for (let scouter of scouterList) {
        if (scouter.timestamp in scouters) {
            scouters[scouter.timestamp].updateScouterElement(scouter.state);
        } else {
            if (scouter.state.status == SCOUTER_STATUS.COMPLETE || !scouter.state.connected) continue; //it's already submitted/disconnected, dont show it.
            scouters[scouter.timestamp] = new ScouterDisplay(scouter);
        }
        if (scouter.state.status == SCOUTER_STATUS.COMPLETE || !scouter.state.connected) { //prune offline/complete scouters from the list
            setTimeout(() => {
                if (scouters[scouter.timestamp] && (scouters[scouter.timestamp].scouter.state.status == SCOUTER_STATUS.COMPLETE || !scouters[scouter.timestamp].scouter.state.connected)) {
                    scouters[scouter.timestamp].destruct();
                    delete scouters[scouter.timestamp]
                }
            },15000)
        }
    }

    //prune scouters that no longer exist
    for (let timestamp in scouters) {
        if (!scouterList.find(x=>x.timestamp = timestamp)) { //they no longer exist
            scouters[timestamp].destruct();
            delete scouters[timestamp];
        }
    }
}

fetchScouters();
setInterval(fetchScouters, 2500);

class ScouterDisplay {
    scouterElement;
    scouter;

    constructor (scouter) {
        this.scouter = scouter;

        this.scouterElement = document.createElement("div");
        this.scouterElement.innerHTML = `
        <div class="matchNumber"></div>
        <div class="scouterId"></div>
        <div class="robotNumber"></div>
        <div class="scouterStatus"></div>
        `;
        this.scouterElement.classList.add("scouter");

        document.querySelector("#scoutersContainer").appendChild(this.scouterElement);

        this.updateScouterElement();
        
    }
    updateScouterElement(state) {

        //update state
        this.scouter.state = state || this.scouter.state;

        //write all text
        this.scouterElement.querySelector(".scouterId").innerText = this.scouter.state.scouterId;
        this.scouterElement.querySelector(".matchNumber").innerText = this.scouter.state.matchNumber;
        this.scouterElement.querySelector(".robotNumber").innerText = this.scouter.state.robotNumber;

        //update color
        const SCOUTER_STATUS_COLOR = {
            "0": "white", //NEW
            "1": "yellow", //WAITING
            "2": "green", //SCOUTING
            "3": "lime" //COMPLETE
        }
        const DISCONNETED_COLOR = "red";

        if (!this.scouter.state.connected && !(this.scouter.state.status == SCOUTER_STATUS.COMPLETE)) { //disconneted and not complete
            this.scouterElement.querySelector(".scouterStatus").style.color = DISCONNETED_COLOR;
            this.scouterElement.querySelector(".scouterStatus").innerText = "DISCONNECTED";
        } else {
            this.scouterElement.querySelector(".scouterStatus").style.color = SCOUTER_STATUS_COLOR[this.scouter.state.status];
            this.scouterElement.querySelector(".scouterStatus").innerText = SCOUTER_STATUS_REVERSE[this.scouter.state.status];
        }
    }
    destruct() {
        this.scouterElement.parentElement.removeChild(this.scouterElement);
    }
}