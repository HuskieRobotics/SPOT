class ThrowError {} //this is probably not best practice, I tried to find a better way but no luck


function createDOMElement(tag, classes, id) {
    const element = document.createElement(tag)
    element.classList = classes
    if (id) {
        element.id = id
    }
    return element
}

function clearDiv(div) {
    for (const child of Array.from(div.children)) {
        if (!child.classList || !child.classList.contains("persist")) {
            div.removeChild(child)
        }
    }
}


function getPath(obj, path, ifNone=ThrowError) {
    if (typeof obj === "undefined") {  
        if (ifNone === ThrowError)  {
            throw new Error("path not traversable!");
        } else {  
            return ifNone;
        }
    }
    if (path === "") return obj;
    path = path.split(".");
    return getPath(obj[path.shift()], path.join("."), ifNone);
}