document.querySelector("#form .save").addEventListener("click", async () => {
    if (ScoutingSync.state.offlineMode) {
        ScoutingSync.updateState({ //dont await, the network is going to fail
            matchNumber: document.querySelector("#form .match-number").value,
            robotNumber: document.querySelector("#form .robot-number").value,
            scouterId: `${document.querySelector("#form .first-name").value}${document.querySelector("#form .last-name").value}`,
            status: ScoutingSync.SCOUTER_STATUS.WAITING
        })
        switchPage("match-scouting");
    } else {
        await ScoutingSync.updateState({
            scouterId: `${document.querySelector("#form .first-name").value}${document.querySelector("#form .last-name").value}`,
            status: ScoutingSync.SCOUTER_STATUS.WAITING
        })
        switchPage("waiting");
    }
})

function updateForm() {
    if (ScoutingSync.state.offlineMode || !ScoutingSync.state.connected) { //only show manual entry for robot and match number when permenantly offline or temporarily disconnected
        document.querySelector("#form .match-number").parentElement.style.display = "inline";
        document.querySelector("#form .robot-number").parentElement.style.display = "inline";
    } else {
        document.querySelector("#form .match-number").parentElement.style.display = "none";
        document.querySelector("#form .robot-number").parentElement.style.display = "none";
    }
}