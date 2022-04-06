let page = "landing"
document.querySelector("#instructions .ok").addEventListener("click", async () => {
    // console.log("switched to page "+ page)
    switchPage(page)
})

function setPage(newPage){
    page = newPage
    // console.log("set to page "+ page)
}