function showFade(element) {
  element.classList.add("visible");
}

function hideFade(element) {
  element.classList.remove("visible");
}

async function loadAround(func) {
  startLoad();
  await func();
  endLoad();
}

async function startLoad() {
  clearTimeout(resetLoadTimeout);
  loadingBar.style.width = "30%";
  loadingBar.style.opacity = 1;
  loadingBar.style.height = "4px";
}

async function endLoad() {
  loadingBar.style.width = "100%";
  document.body.style.backgroundColor = "white";
  setTimeout(() => {
    document.body.style.backgroundColor = "var(--bg)";
    loadingBar.style.height = 0;
    loadingBar.style.opacity = 0;
    resetLoadTimeout = setTimeout(() => {
      loadingBar.style.width = 0;
      setTimeout(() => {
        loadingBar.style.opacity = 1;
        loadingBar.style.height = "4px";
      }, 500);
    }, 500);
  }, 750);
}

let resetLoadTimeout;

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

function setPath(obj, path, value) {
  if (!path.includes(".")) return (obj[path] = value);
  path = path.split(".");
  if (!obj[path[0]]) obj[path[0]] = {};
  return setPath(obj[path.shift()], path.join("."), value);
}

/* New function to toggle the sidebar */
function toggleSidebar() {
  const app = document.getElementById("app");
  app.classList.toggle("sidebar-hidden");
}