function toggleSettingsMenu() {
  var overlay = document.getElementById("settingsOverlay");
  if (overlay.style.display === "none" || overlay.style.display === "") {
    overlay.style.display = "flex";
  } else {
    overlay.style.display = "none";
  }

  /**
   * @type {HTMLSelectElement}
   */
  const defTeamSelector = document.querySelector("#defaultTeam");
  try {
    const defTeam = localStorage.getItem("defaultTeam");
    // Convert R1 - B3 to 0 - 6, then set the selected option
    defTeamSelector.options[(defTeam[0] == "B") * 3 + Number(defTeam[1])].selected = true;
  } catch (e) {
    console.error("Can't restore select menu option", e);
    defTeamSelector.options[0].selected = true;
  }
}

function goToAnalysis() {
  window.open("/analysis").focus();
}

window.onclick = function (event) {
  var overlay = document.getElementById("settingsOverlay");
  if (event.target === overlay) {
    overlay.style.display = "none";
  }
};

function toggleDarkMode() {
  var body = document.body;
  let vStr = document.getElementById("v-string");
  let status = document.getElementById("connection-status");
  let form = document.getElementById("landing-style");
  let scout = document.getElementById("match-color");
  let wait = document.getElementById("wait-color");
  let action = document.getElementById("last-actions");
  let reloadPopup = document.getElementById("internal");

  var menuImage = document.querySelector("#landing .menu-button");
  var logoImage = document.querySelector("#landing .logo");

  body.classList.toggle("dark-mode");

  if (body.classList.contains("dark-mode")) {
    localStorage.setItem("darkMode", "true");
    menuImage.src = "/icons/menu-button-dark.png";
    logoImage.src = "/img/logo-dark-mode.png";
    document.documentElement.style.setProperty("--reload-color", "#efefef");
    document.getElementById("darkModeOn").innerHTML = "Disable Dark Mode";
    document
      .getElementById("pagestyle")
      .setAttribute("href", "/css/landing-dark.css");
    vStr.style.background = "#191b1c";
    vStr.style.color = "#efefef";
    status.style.color = "#4798b6";
    reloadPopup.setAttribute("href", "css/internal-dark.css");
    form.setAttribute("href", "css/form-dark.css");
    scout.setAttribute("href", "css/match-scouting-dark.css");
    wait.setAttribute("href", "css/waiting-dark.css");
    action.style.color = "#efefef";
  } else {
    localStorage.setItem("darkMode", "false");
    menuImage.src = "/icons/menu-button.png";
    logoImage.src = "/img/logo.png";
    document.documentElement.style.setProperty("--reload-color", "#000000");
    document.getElementById("darkModeOn").innerHTML = "Enable Dark Mode";
    +document
      .getElementById("pagestyle")
      .setAttribute("href", "/css/landing.css");
    vStr.style.background = "#efefef";
    vStr.style.color = "#191b1c";
    status.style.color = "#4caf50";
    reloadPopup.setAttribute("href", "css/internal.css");
    form.setAttribute("href", "css/form.css");
    scout.setAttribute("href", "css/match-scouting.css");
    wait.setAttribute("href", "css/waiting.css");
    action.style.color = "#232323";
  }

  var overlay = document.getElementById("settingsOverlay");
  overlay.style.display = "none";
}

// `this` = Select menu with D, R1, R2, R3, B1, B2, B3
function setDefaultTeam() {
  /**
   * @type {HTMLSelectElement}
   */
  const defTeamSelector = document.querySelector("#defaultTeam");
  localStorage.setItem("defaultTeam", defTeamSelector.options[defTeamSelector.selectedIndex].value);
  console.log("Set default team to", localStorage.getItem("defaultTeam"));
}

if (localStorage.getItem("darkMode") === "true") {
  var i = 0;
  // I have no idea why it's switching back(immidiately) to light mode, but this should fix it
  setTimeout(() => {
    do {
      i++
      localStorage.setItem("darkMode", "true");
      toggleDarkMode();
      console.log("Attempting to enable dark mode:", i);
      if (i > 100) {
        localStorage.setItem("darkMode", "true");
        console.warn("Failed to enable dark mode after 100 attempts");
        break;
      }
    } while (localStorage.getItem("darkMode") === "false");
  }, 1000);
}