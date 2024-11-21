function changesheet() {}

function goto() {
  window.open("https://scouting.team3061.org/analysis/").focus;
}

function toggleSettingsMenu() {
  var overlay = document.getElementById("settingsOverlay");
  if (overlay.style.display === "none" || overlay.style.display === "") {
    overlay.style.display = "flex";
  } else {
    overlay.style.display = "none";
  }
}

window.onclick = function (event) {
  var overlay = document.getElementById("settingsOverlay");
  if (event.target === overlay) {
    overlay.style.display = "none";
  }
};

function toggleDarkMode() {
  var body = document.body;
  let vstr = document.getElementById("v-string");
  let status = document.getElementById("connection-status");
  let form = document.getElementById("landing-style");
  let scout = document.getElementById("match-color");
  let wait = document.getElementById("wait-color");
  let action = document.getElementById("last-actions");

  var menuImage = document.querySelector("#landing .menu-out .menu");
  body.classList.toggle("dark-mode");

  if (body.classList.contains("dark-mode")) {
    menuImage.src = "/img/menu-button-dark.png";
    document
      .getElementById("pagestyle")
      .setAttribute("href", "/css/landing-dark.css");
    vstr.style.background = "#191b1c";
    vstr.style.color = "#efefef";
    status.style.color = "#ac56d1";
    form.setAttribute("href", "css/form-dark.css");
    scout.setAttribute("href", "css/match-scouting-dark.css");
    wait.setAttribute("href", "css/waiting-dark.css");
    action.style.color = "#efefef";
  } else {
    menuImage.src = "/img/menu-button.png";
    document
      .getElementById("pagestyle")
      .setAttribute("href", "/css/landing.css");
    vstr.style.background = "#efefef";
    vstr.style.color = "#191b1c";
    status.style.color = "#4caf50";
    form.setAttribute("href", "css/form.css");
    scout.setAttribute("href", "css/match-scouting.css");
    wait.setAttribute("href", "css/waiting.css");
    action.style.color = "#232323";
  }
}
