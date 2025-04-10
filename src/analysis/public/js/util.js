class ThrowError {} //this is probably not best practice, I tried to find a better way but no luck

function createDOMElement(tag, classes, id) {
  const element = document.createElement(tag);
  element.classList = classes;
  if (id) {
    element.id = id;
  }
  return element;
}

function clearDiv(div) {
  for (const child of Array.from(div.children)) {
    if (!child.classList || !child.classList.contains("persist")) {
      div.removeChild(child);
    }
  }
}

function getPath(obj, path, ifnone = ThrowError) {
  if (typeof obj === "undefined") {
    if (ifnone == ThrowError) {
      throw new Error(`path ${path} not traversable!`);
    } else {
      return ifnone;
    }
  }
  if (path === "") return obj;
  path = path.split(".");
  return getPath(obj[path.shift()], path.join("."), ifnone);
}

/**
 * set a value at a keypath within an object
 * @param {Object} obj the object that will be modified
 * @param {String} path the keypath where you wish to set the value (eg. "team.counts.lowerHub"). If this is not fully defined, it will be created
 * @param {Object} value the value to set at the path
 * @returns the value
 */

function setPath(obj, path, value) {
  if (!path.includes(".")) return (obj[path] = value);
  path = path.split(".");
  if (!obj[path[0]]) obj[path[0]] = {}; // if the path doesn't exist, make an empty object there
  return setPath(obj[path.shift()], path.join("."), value);
}
