document.querySelector("#form .save").addEventListener("click", async () => {
  localStorage.setItem(
    "firstName",
    document.querySelector("#form .first-name").value
  ); //store form values in localstorage
  localStorage.setItem(
    "lastName",
    document.querySelector("#form .last-name").value
  );

  if (ScoutingSync.state.offlineMode) {
    ScoutingSync.updateState({
      //dont await, the network is going to fail
      matchNumber: document.querySelector("#form .match-number").value,
      robotNumber: document.querySelector("#form .robot-number").value,
      scouterId: `${document.querySelector("#form .first-name").value}${document.querySelector("#form .last-name").value
        }`,
      status: ScoutingSync.SCOUTER_STATUS.WAITING,
    });
    switchPage("match-scouting");
    document.querySelector(".scouting-info").style.display = "block";
  } else {
    await ScoutingSync.updateState({
      scouterId: `${document.querySelector("#form .first-name").value}${document.querySelector("#form .last-name").value
        }`,
      status: ScoutingSync.SCOUTER_STATUS.WAITING,
    });
    switchPage("waiting");
  }
});

function updateForm() {
  try {
    document.querySelector("#form .first-name").value =
      localStorage.getItem("firstName") || "";
    document.querySelector("#form .last-name").value =
      localStorage.getItem("lastName") || "";

    if (ScoutingSync.state.offlineMode || !ScoutingSync.state.connected) {
      //only show manual entry for robot and match number when permenantly offline or temporarily disconnected
      document.querySelector(
        "#form .match-number"
      ).parentElement.style.display = "inline";
      document.querySelector(
        "#form .robot-number"
      ).parentElement.style.display = "inline";

      const matchNum = document.querySelector("#form .match-number");
      for (let i = matchNum.options.length - 1; i >= 0; i--) {
        matchNum.remove(i);
      }
      ScoutingSync.matches.forEach((robot) => {
        matchNum.add(new Option(`Match #${robot.number}`, `${robot.number}`));
      });
      updateSelectMenu();
    } else {
      document.querySelector(
        "#form .match-number"
      ).parentElement.style.display = "none";
      document.querySelector(
        "#form .robot-number"
      ).parentElement.style.display = "none";
    }
  } catch (e) {
    //keep going even if this errors, we need them to be able to input data
  }
}

function updateSelectMenu() {
  /**
   * @type {HTMLSelectElement}
   */
  const robotNum = document.querySelector("#form .robot-number");
  for (let i = robotNum.options.length - 1; i >= 0; i--) {
    robotNum.remove(i);
  }
  const match = ScoutingSync.matches.find((match) => `${match.number}` == document.querySelector("#form .match-number").selectedOptions.item(0).value);
  if (match) {
    [...match.robots.red, ...match.robots.blue].forEach((robot) => {
      const opt = new Option(`${match.robots.red.includes(robot) ? "Red " : "Blue"} | ${robot}`, `${robot}`);
      robotNum.add(opt);
    });
  } else {
    const opt = new Option("Select a match number", "N/A");
    opt.disabled = true;
    robotNum.add(opt);
  }
}