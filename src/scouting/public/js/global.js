// for (const button of document.querySelectorAll(".debug-switcher button")) {
//     button.addEventListener("click", () => {
//         switchPage(button.classList.toString())
//     })
// }

// const syncButton = document.createElement("button")
// syncButton.innerText = "sync"
// syncButton.addEventListener("click", () => {
//     ScoutingSync.sync()
// })

// document.querySelector(".debug-switcher").appendChild(syncButton)

document.querySelector(".reload").addEventListener("click", () => {
  new Modal("small")
    .header("Warning")
    .text("Are you sure you want to reload?")
    .action("Reload", () => window.location.reload());
});
