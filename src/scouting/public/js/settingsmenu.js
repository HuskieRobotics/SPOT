function toggleSettingsMenu() {
  var overlay = document.getElementById("settingsOverlay");
  if (overlay.style.display === "none" || overlay.style.display === "") {
    overlay.style.display = "flex";
  } else {
    overlay.style.display = "none";
  }
}

function goToAnalysis() {
  window.open("/analysis").focus();
}

function goToAdmin() {
  window.open("/admin").focus();
}

window.onclick = function (event) {
  var overlay = document.getElementById("settingsOverlay");
  if (event.target === overlay) {
    overlay.style.display = "none";
  }

  if (
    localStorage.getItem("theme") == null ||
    localStorage.getItem("theme") == "light"
  ) {
    document.getElementById("darkModeOn").innerHTML = "Enable Dark Mode";
  } else {
    document.getElementById("darkModeOn").innerHTML = "Disable Dark Mode";
  }
};

if (
  localStorage.getItem("theme") == null ||
  localStorage.getItem("theme") == "light"
) {
  localStorage.setItem("theme", "light");
  document.documentElement.setAttribute("data-theme", "light");
} else {
  localStorage.setItem("theme", "dark");
  document.documentElement.setAttribute("data-theme", "dark");
}

function toggleDarkMode() {
  var overlay = document.getElementById("settingsOverlay");
  overlay.style.display = "none";

  if (
    localStorage.getItem("theme") == null ||
    localStorage.getItem("theme") == "light"
  ) {
    localStorage.setItem("theme", "dark");
    document.documentElement.setAttribute("data-theme", "dark");
    document.getElementById("darkModeOn").innerHTML = "Disable Dark Mode";
  } else {
    localStorage.setItem("theme", "light");
    document.documentElement.setAttribute("data-theme", "light");
    document.getElementById("darkModeOn").innerHTML = "Enable Dark Mode";
  }
}
