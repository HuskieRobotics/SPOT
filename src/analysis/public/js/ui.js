function showFade(element) {
    element.classList.add("visible")
}

function hideFade(element) {
    element.classList.remove("visible")
}

async function loadAround(func) {
    startLoad()
    await func()
    endLoad()
}

async function startLoad() {
    clearTimeout(resetLoadTimeout)
    loadingBar.style.width = "30%"
    loadingBar.style.opacity = 1
    loadingBar.style.height = "4px"
}

async function endLoad() {
    loadingBar.style.width = "100%"
    document.body.style.backgroundColor = "white"
    setTimeout(() => {
        document.body.style.backgroundColor = "var(--bg)"
        loadingBar.style.height = 0
        loadingBar.style.opacity = 0
        resetLoadTimeout = setTimeout(() => {
            loadingBar.style.width = 0
            setTimeout(() => {
                loadingBar.style.opacity = 1
                loadingBar.style.height = "4px"
            }, 500)
        }, 500)
    }, 750)
}

let resetLoadTimeout

function createDOMElement(tag, classes, id) {
    const element = document.createElement(tag)
    element.classList = classes
    if (id) {
        element.id = id
    }
    return element
}