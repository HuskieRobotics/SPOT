let page = "landing"
document.querySelector("#instructions .ok").addEventListener("click", async () => {
    switchPage(page)
})

function setPage(page){
    this.page = page
}