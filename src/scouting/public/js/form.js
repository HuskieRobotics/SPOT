document.querySelector("#form .save").addEventListener("click", () => {
    if (ScoutingSync.state.offlineMode) {
        ScoutingSync.updateState({
            matchNumber: document.querySelector("#form .match-number").value,
            robotNumber: document.querySelector("#form .robot-number").value,
            scouterId: `${document.querySelector("#form .first-name").value}${document.querySelector("#form .last-name").value}`,
            status: ScoutingSync.SCOUTER_STATUS.WAITING
        })
    } else {
        ScoutingSync.updateState({
            scouterId: `${document.querySelector("#form .first-name").value}${document.querySelector("#form .last-name").value}`,
            status: ScoutingSync.SCOUTER_STATUS.WAITING
        })
    }
    switchPage("waiting");
})

function updateForm() {
    if (ScoutingSync.state.offlineMode) { //only show manual entry for robot and match number when offline
        document.querySelector("#form .match-number").parentElement.style.display = "block";
        document.querySelector("#form .robot-number").parentElement.style.display = "block";
    } else {
        document.querySelector("#form .match-number").parentElement.style.display = "none";
        document.querySelector("#form .robot-number").parentElement.style.display = "none";
    }
}