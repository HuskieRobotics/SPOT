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
};

function toggleDarkMode() {
  var overlay = document.getElementById("settingsOverlay");
  overlay.style.display = "none";
}
