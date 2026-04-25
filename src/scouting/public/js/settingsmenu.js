function toggleSettingsMenu() {
  var overlay = document.getElementById("settingsOverlay");
  var feedbackOverlay = document.getElementById("feedbackOverlay");

  if (feedbackOverlay) {
    feedbackOverlay.style.display = "none";
  }

  if (overlay.style.display === "none" || overlay.style.display === "") {
    overlay.style.display = "flex";
  } else {
    overlay.style.display = "none";
  }
}

function toggleFeedbackMenu() {
  var overlay = document.getElementById("feedbackOverlay");
  var settingsOverlay = document.getElementById("settingsOverlay");

  if (!overlay) {
    return;
  }

  if (settingsOverlay) {
    settingsOverlay.style.display = "none";
  }

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
  var feedbackOverlay = document.getElementById("feedbackOverlay");
  var darkModeButton = document.getElementById("darkModeOn");

  if (event.target === overlay) {
    overlay.style.display = "none";
  }

  if (event.target === feedbackOverlay) {
    feedbackOverlay.style.display = "none";
  }

  if (darkModeButton) {
    if (
      localStorage.getItem("theme") == null ||
      localStorage.getItem("theme") == "light"
    ) {
      darkModeButton.innerHTML = "Enable Dark Mode";
    } else {
      darkModeButton.innerHTML = "Disable Dark Mode";
    }
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
