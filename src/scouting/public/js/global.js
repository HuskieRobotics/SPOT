for (const button of document.querySelectorAll(".debug-switcher button")) {
    button.addEventListener("click", () => {
        switchPage(button.classList.toString())
    })
}

const syncButton = document.createElement("button")
syncButton.innerText = "sync"
syncButton.addEventListener("click", () => {
    ScoutingSync.sync()
})

document.querySelector(".debug-switcher").appendChild(syncButton)