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
    vstr.style.background = "#191b1c";
    vstr.style.color = "#efefef";
  } else {
    theme.setAttribute("href", "/css/landing.css");
    status.style.color = "#4caf50";
    form.setAttribute("href", "css/form.css");
    scout.setAttribute("href", "css/match-scouting.css");
    wait.setAttribute("href", "css/waiting.css");
    vstr.style.background = "#efefef";
    vstr.style.color = "#191b1c";
  }
}

function goto() {
  window.open("https://scouting.team3061.org/analysis/").focus;
}
