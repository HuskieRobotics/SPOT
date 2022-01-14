document.querySelector("#form .save").addEventListener("click", () => {
    ScoutingSync.updateState({
        matchNumber: document.querySelector("#form .match-number").value,
        robotNumber: document.querySelector("#form .robot-number").value,
        scouterId: `${document.querySelector("#form .first-name").value}${document.querySelector("#form .last-name").value}`
    })
    switchPage("waiting");
})