var manualMatches = [];

// authentication
(async () => {
  const authRequest = await fetch("./api/auth").then((res) => res.json());

  if (authRequest.status !== 2) {
    const authModal = new Modal("small", false).header("Sign In");
    const accessCodeInput = createDOMElement("input", "access-input");
    accessCodeInput.placeholder = "Access Code";
    accessCodeInput.type = "password";
    accessCodeInput.addEventListener("keydown", (e) => {
      if (e.keyCode == 13) {
        validate(accessCodeInput.value, authModal);
      }
    });
    authModal.element.appendChild(accessCodeInput);
    authModal.action("Submit", async () => {
      validate(accessCodeInput.value, authModal);
    });
  } else {
    await constructApp();
  }

  async function validate(accessCode, authModal) {
    const auth = await fetch("./api/auth", {
      headers: {
        Authorization: accessCode,
      },
    }).then((res) => res.json());

    if (auth.status === 1) {
      await constructApp(accessCode);
      authModal.modalExit();
    } else {
      new Popup("error", "Wrong Access Code");
    }
  }

  let numMatchesInput = document.querySelector("#numMatches");
  numMatchesInput.addEventListener("keydown", function (e) {
    if (e.keyCode == 13) {
      while (manualMatches.length > numMatchesInput.value) {
        manualMatches.pop();
      }
      while (manualMatches.length < numMatchesInput.value) {
        manualMatches.push({
          number: manualMatches.length + 1,
          match_string: `2023temp_q${manualMatches.length + 1}`,
          robots: {
            red: ["0", "0", "0"],
            blue: ["0", "0", "0"],
          },
        });
      }
      updateMatches();
      processTeams();
    }
  });
})();

// construct app
async function constructApp() {
  manualMatches =
    (await fetch("/schedule/api/matches").then((res) => res.json())) || [];
  document.querySelector("#numMatches").value = manualMatches.length;
  updateMatches();
}

async function updateMatches() {
  document.querySelector("#match-list").innerHTML = "";
  for (const match of manualMatches) {
    let matchElement = document.createElement("div");
    document.querySelector("#match-list").appendChild(matchElement);
    matchElement.classList.add("match");
    matchElement.innerHTML = `
        <div class="match-header"><strong>${
          match.number
        }</strong> - ${"MANUAL"}-<strong>${"QM" + match.number}</strong></div> 
 
        <div class="match-teams red qm${match.number}">
        <div class="match-team m${
          match.number
        }" contentEditable="true" tm="r1"> ${match.robots.red[0] || ""} </div>
        <div class="match-team m${
          match.number
        }" contentEditable="true" tm="r2"> ${match.robots.red[1] || ""} </div>
        <div class="match-team m${
          match.number
        }" contentEditable="true" tm="r3"> ${match.robots.red[2] || ""} </div>
        </div>
        <div class="match-teams blue qm${match.number}">
        <div class="match-team m${
          match.number
        }" contentEditable="true" tm="b1"> ${match.robots.blue[0] || ""} </div>
        <div class="match-team m${
          match.number
        }" contentEditable="true" tm="b2"> ${match.robots.blue[1] || ""} </div>
        <div class="match-team m${
          match.number
        }" contentEditable="true" tm="b3"> ${match.robots.blue[2] || ""} </div>
        </div>
        `;

    matchElement.querySelectorAll(".match-team").forEach((team) => {
      team.addEventListener("input", () => {
        processTeams();
      });
    });
  }
}

async function processTeams() {
  for (const match of manualMatches) {
    let data = document.querySelectorAll(`.m${match.number}`);

    let redTeams = [];
    let blueTeams = [];

    for (let i = 0; i < 3; i++) {
      redTeams.push(data[i].innerText);
      blueTeams.push(data[i + 3].innerText);
    }

    // access the correct match object and then adding to properties
    match.robots.red = redTeams;
    match.robots.blue = blueTeams;
  }

  // post request to send schedule to admin
  console.log(manualMatches);
  console.log(JSON.stringify(manualMatches));
  fetch("/schedule/api/matches", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(manualMatches),
  }).catch((e) => console.log(e));
}
