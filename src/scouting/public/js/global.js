for (const button of document.querySelectorAll(".debug-switcher button")) {
    button.addEventListener("click", () => {
        switchPage(button.classList.toString())
    })
}