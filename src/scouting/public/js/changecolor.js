function changesheet() {
  let theme = document.getElementById("pagestyle");
  let status = document.getElementById("connection-status");
  let form = document.getElementById("landing-style");
  let scout = document.getElementById("match-color");
  let wait = document.getElementById("wait-color");
  let vstr = document.getElementById("v-string");

  if (theme.getAttribute("href") == "/css/landing.css") {
    theme.setAttribute("href", "/css/landing-dark.css");
    status.style.color = "#ac56d1";
    form.setAttribute("href", "css/form-dark.css");
    scout.setAttribute("href", "css/match-scouting-dark.css");
    wait.setAttribute("href", "css/waiting-dark.css");
    vstr.style.background = "#4f0d6b";
  } else {
    theme.setAttribute("href", "/css/landing.css");
    status.style.color = "#4caf50";
    form.setAttribute("href", "css/form.css");
    scout.setAttribute("href", "css/match-scouting.css");
    wait.setAttribute("href", "css/waiting.css");
  }
}
