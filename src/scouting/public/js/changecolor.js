function changesheet() {
  let theme = document.getElementById("pagestyle");
  let status = document.getElementById("connection-status");

  if (theme.getAttribute("href") == "/css/landing2.css") {
    theme.setAttribute("href", "/css/landing.css");
    status.style.color = "#ac56d1";
  } else {
    theme.setAttribute("href", "/css/landing2.css");
    status.style.color = "#4caf50";
  }
}
