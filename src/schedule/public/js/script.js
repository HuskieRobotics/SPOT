


// ;(async () => {
//     const authRequest = await fetch("./api/auth").then(res => res.json())

//     if (authRequest.status !== 2) {
//         const authModal = new Modal("small", false).header("Sign In")
//         const accessCodeInput = createDOMElement("input", "access-input")
//         accessCodeInput.placeholder = "Access Code"
//         accessCodeInput.type = "password"
//         accessCodeInput.addEventListener("keydown", (e) => {
//             if (e.keyCode == 13) {
//                 validate(accessCodeInput.value, authModal)
//             }
//         })
//         authModal.element.appendChild(accessCodeInput)
//         authModal.action("Submit", async () => {
//             validate(accessCodeInput.value, authModal)
//         })
//     } else {
//         await constructApp()
//     }

//     async function validate(accessCode, authModal) {
//         const auth = await fetch("./api/auth", {
//             headers: {
//                 Authorization: accessCode
//             }
//         }).then(res => res.json())

//         if (auth.status === 1) {
//             await constructApp(accessCode)
//             authModal.modalExit()
//         } else {
//             new Popup("error", "Wrong Access Code")
//         }
//     }
// })()

// async function constructApp(accessCode) {

//     await updateMatches(accessCode)
//     setInterval(() => updateMatches(accessCode), 2500);

//     document.querySelector("#start-scouting").addEventListener("click", () => {
//         fetch("/admin/api/enterMatch", {
//             headers: {
//                 Authorization: accessCode
//             }
//         });
//         console.log("ENTER MATCH!")
//     })

//     let menuExpanded = false

//     document.querySelector("#admin-panel").classList.add("visible")
//     document.querySelector("#menu").classList.add("visible")

//     document.querySelector("#menu-icon").addEventListener("click", () => {
//         if (menuExpanded) {
//             document.querySelector("#menu").classList.remove("expanded")
//         } else {
//             document.querySelector("#menu").classList.add("expanded")
//         }
//         menuExpanded = !menuExpanded
//     })
// }


async function updateMatches(accessCode) {
    let {allMatches, currentMatch} = await (await fetch(`/admin/api/matches`, {
        headers: {
            Authorization: accessCode
        }
    })).json();

    //clear matches view
    document.querySelector("#match-list").innerHTML = "";

    //rebuild matches view
    for (let match of allMatches) {
        let matchElement = document.createElement("div");
        matchElement.classList.add("match");
        matchElement.innerHTML = `
        <div class="match-header"><strong>${match.number}</strong> - ${match.match_string.toUpperCase().split("_")[0]}-<strong>${match.match_string.toUpperCase().split("_")[1]}</strong></div>
        <input type="checkbox" class="match-select">
        <div class="match-teams red"></div>
        <div class="match-teams blue"></div>
        `
        document.querySelector("#match-list").appendChild(matchElement);


        //add the robot numbers to match
        for (let color of ["red","blue"]) {
            for (let robotNumber of match.robots[color]) {
                let text = document.createElement("div");
                text.innerText = robotNumber;
                matchElement.querySelector(`.match-teams.${color}`).appendChild(text)
            }
        }

    }
}

// class ScouterDisplay {
//     scouterElement;
//     scouter;

//     constructor (scouter) {
//         this.scouter = scouter;

//         this.scouterElement = document.createElement("div");
//         this.scouterElement.innerHTML = `
//         <div class="match-number"></div>
//         <div class="scouter-id"></div>
//         <div class="robot-number"></div>
//         <div class="scouter-status"></div>
//         `;
//         this.scouterElement.classList.add("scouter");

//         document.querySelector("#scouter-list").appendChild(this.scouterElement);

//         this.updateScouterElement();
        
//     }
//     updateScouterElement(state) {

//         //update state
//         this.scouter.state = state || this.scouter.state;

//         //write all text
//         this.scouterElement.querySelector(".scouter-id").innerText = this.scouter.state.scouterId;
//         this.scouterElement.querySelector(".match-number").innerText = this.scouter.state.matchNumber;
//         this.scouterElement.querySelector(".robot-number").innerText = this.scouter.state.robotNumber;

//         //update color
//         const SCOUTER_STATUS_COLOR = {
//             "0": "var(--text)", //NEW
//             "1": "#ffa500", //WAITING
//             "2": "var(--accent)", //SCOUTING
//             "3": "var(--green)" //COMPLETE
//         }
//         const DISCONNECTED_COLOR = "var(--error)";

//         if (this.scouter.state.status == SCOUTER_STATUS.NEW) {
//             this.scouterElement.style.display = "none";
//         } else {
//             this.scouterElement.style.display = "flex";
//         }

//         if (!this.scouter.state.connected && !(this.scouter.state.status == SCOUTER_STATUS.COMPLETE)) { //disconneted and not complete
//             this.scouterElement.querySelector(".scouter-status").style.color = DISCONNECTED_COLOR;
//             this.scouterElement.style.borderColor = DISCONNECTED_COLOR;
//             this.scouterElement.querySelector(".match-number").style.backgroundColor = DISCONNECTED_COLOR;
//             this.scouterElement.querySelector(".match-number").style.borderColor = DISCONNECTED_COLOR;
//             this.scouterElement.querySelector(".scouter-status").innerText = "DISCONNECTED";
//         } else {
//             this.scouterElement.querySelector(".scouter-status").style.color = SCOUTER_STATUS_COLOR[this.scouter.state.status];
//             this.scouterElement.style.borderColor = SCOUTER_STATUS_COLOR[this.scouter.state.status];
//             this.scouterElement.querySelector(".match-number").style.backgroundColor = SCOUTER_STATUS_COLOR[this.scouter.state.status];
//             this.scouterElement.querySelector(".match-number").style.borderColor = SCOUTER_STATUS_COLOR[this.scouter.state.status];
//             this.scouterElement.querySelector(".scouter-status").innerText = SCOUTER_STATUS_REVERSE[this.scouter.state.status];
//         }
//     }
//     destruct() {
//         this.scouterElement.parentElement.removeChild(this.scouterElement);
//     }
// }

// // not sure if this will work but building a [] of matches in the proper format
// let processedMatches = [];

// //add the level offset to each match and simplify structure
// for (let match of tbaMatches) {
//     processedMatches.push({
//         number: match.match_number + levelOffsets[match.comp_level], //adjust match number with the offset
//         match_string: match.key,
//         robots: {
//             red: match.alliances.red.team_keys.map(x=>x.replace("frc","")),
//             blue: match.alliances.blue.team_keys.map(x=>x.replace("frc",""))
//         }
//     });
// }