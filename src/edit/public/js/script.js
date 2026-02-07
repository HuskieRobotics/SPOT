let oldAccessCode;
(async () => {
  let dataset;
  let transformers;
  console.log("Loading data...");

  function showFade(element) {
    element.classList.add("visible");
  }

  function hideFade(element) {
    element.classList.remove("visible");
  }

  async function getTMPS() {
    // Get tmps from database (or cache if offline)
    let tmps = await fetch("/analysis/api/dataset").then((res) => res.json());

    // Get all tmps stored in the local storage (from qr code)
    const storage = localStorage.getItem("teamMatchPerformances");
    if (storage) {
      // Parse the QR code TMPs (for some reason the array is stored as a string, and each TMP is ALSO
      // stored as a string, so the array has to be parsed and each individual TMP has to be parsed)
      const qrcodeTmps = JSON.parse(storage).map((tmp) => JSON.parse(tmp));

      // Merge the TMPs into one
      //tmps = [...tmps];
    }

    return tmps;
  }

  const authRequest = await fetch("/admin/api/auth").then((res) => res.json());

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
    await constructApp("");
  }

  async function validate(accessCode, authModal) {
    const auth = await fetch("/admin/api/auth", {
      headers: {
        Authorization: accessCode,
      },
    }).then((res) => res.json());

    if (auth.status === 1) {
      await constructApp(accessCode);
      oldAccessCode = accessCode;
      authModal.modalExit();
    } else {
      new Popup("error", "Wrong Access Code");
    }
  }

  async function constructApp(accessCode) {
    await loadAround(async () => {
      const modulesConfig = await fetch(`/config/analysis-modules.json`).then(
        (res) => res.json(),
      );
      dataset = await getTMPS();

      showElements(dataset, modulesConfig);
      await new Promise((r) => setTimeout(r, 300));
    });
    document.getElementById("title").classList.add("visible");
  }

  function showElements(dataset, moduleConfig) {
    const listContainer = document.getElementById("match-list");
    listContainer.innerHTML = ""; // Clear any existing content

    // Create filter inputs
    const filterContainer = document.createElement("div");
    filterContainer.classList.add("filter-container");

    const scouterFilter = document.createElement("input");
    scouterFilter.placeholder = "Filter by Scouter Name";
    scouterFilter.classList.add("filter-input");

    const matchFilter = document.createElement("input");
    matchFilter.placeholder = "Filter by Match Number";
    matchFilter.classList.add("filter-input");
    matchFilter.type = "number";

    const robotFilter = document.createElement("input");
    robotFilter.placeholder = "Filter by Robot Number";
    robotFilter.classList.add("filter-input");
    robotFilter.type = "number";

    filterContainer.appendChild(scouterFilter);
    filterContainer.appendChild(matchFilter);
    filterContainer.appendChild(robotFilter);
    listContainer.appendChild(filterContainer);

    async function updateList() {
      const filteredData = dataset.filter((match) => {
        const matchScouterId = String(match.scouterId).toLowerCase();
        const scouterValue = scouterFilter.value.toLowerCase();
        const matchValue = matchFilter.value;
        const robotValue = robotFilter.value;

        return (
          (!scouterValue || matchScouterId.includes(scouterValue)) &&
          (!matchValue || match.matchNumber === Number(matchValue)) &&
          (!robotValue || match.robotNumber === Number(robotValue))
        );
      });

      // Sort by timestamp
      filteredData.sort((a, b) => b.timestamp - a.timestamp);

      // Clear existing items
      const items = listContainer.querySelectorAll(".match-item");
      items.forEach((item) => item.remove());

      let tbaData = await fetch("/edit/blueApiData").then((res) => res.json());

      // Build robots by match from qualification matches (keep first occurrence)
      const robotsByMatch = tbaData.reduce((acc, match) => {
        if (match.comp_level !== "qm") return acc;
        if (acc[match.match_number]) return acc;

        acc[match.match_number] = [
          ...match.alliances.red.team_keys.map((key) => ({
            robotNumber: Number(key.substring(3)),
            allianceColor: "red",
          })),
          ...match.alliances.blue.team_keys.map((key) => ({
            robotNumber: Number(key.substring(3)),
            allianceColor: "blue",
          })),
        ];
        return acc;
      }, {});

      // Build scouted set per match from filtered data
      const scoutedByMatch = filteredData.reduce((acc, match) => {
        if (!acc[match.matchNumber]) acc[match.matchNumber] = new Set();
        acc[match.matchNumber].add(match.robotNumber);
        return acc;
      }, {});

      // Build unscouted placeholders for matches present in the filtered list
      const unscoutedItems = Array.from(
        new Set(filteredData.map((m) => m.matchNumber)),
      ).flatMap((matchNum) => {
        const teams = robotsByMatch[matchNum] || [];
        const scoutedSet = scoutedByMatch[matchNum] || new Set();
        return teams
          .filter((team) => !scoutedSet.has(team.robotNumber))
          .map((team) => ({
            matchNumber: matchNum,
            robotNumber: team.robotNumber,
            allianceColor: team.allianceColor,
          }));
      });

      // Create items for filtered data
      filteredData.forEach((match) => {
        const listItem = document.createElement("div");
        listItem.classList.add(`match-item`);
        let allianceColor;

        tbaData.forEach((item) => {
          if (item.comp_level == "qm") {
            if (item.match_number == match.matchNumber) {
              for (let team of item.alliances.red.team_keys) {
                if (team.substring(3) == match.robotNumber) {
                  allianceColor = "red";
                }
              }

              for (let team of item.alliances.blue.team_keys) {
                if (team.substring(3) == match.robotNumber) {
                  allianceColor = "blue";
                }
              }
            }
          }
        });

        // Create a container for the top row (arrow, info, and trash)
        const topRow = document.createElement("div");
        topRow.classList.add("match-item-top");

        const dropdownButton = document.createElement("button");
        dropdownButton.textContent = "►";
        dropdownButton.classList.add("dropdown-button");
        topRow.appendChild(dropdownButton);

        // const matchInfo = document.createElement("span");
        // matchInfo.textContent = `Match: ${match.matchNumber}, Robot: ${match.robotNumber}, Scouter: ${match.scouterId}`;
        // matchInfo.classList.add("match-info");
        // topRow.appendChild(matchInfo);

        const matchNum = document.createElement("span");
        matchNum.textContent = `Match: ${match.matchNumber}`;
        matchNum.classList.add("match-info");
        topRow.appendChild(matchNum);

        const matchRobot = document.createElement("span");
        matchRobot.textContent = `Robot: ${match.robotNumber}`;
        matchRobot.classList.add("match-info");
        topRow.appendChild(matchRobot);

        const matchScouter = document.createElement("span");
        matchScouter.textContent = `Scouter: ${match.scouterId}`;
        matchScouter.classList.add("match-info");
        topRow.appendChild(matchScouter);

        const trashButton = document.createElement("button");
        trashButton.textContent = "X";
        trashButton.classList.add("trash-button");
        topRow.appendChild(trashButton);

        listItem.appendChild(topRow);

        // Add dropdown content after the top row
        const dropdownContent = document.createElement("div");
        dropdownContent.classList.add(`dropdown-content`);
        dropdownContent.style.display = "none";
        listItem.appendChild(dropdownContent);

        if (allianceColor == "red") {
          listItem.style.borderColor = "#ff6666";
          dropdownContent.style.borderTopColor = "#ff6666";
        } else {
          listItem.style.borderColor = "--bg-alt";
          dropdownContent.style.borderTopColor = "--bg-alt";
        }

        // Format and display actionQueue data
        if (match.actionQueue && match.actionQueue.length > 0) {
          const actionList = document.createElement("ul");
          let actions = [];

          /**
           * Go through the actionQueue and add each action performed to the action list.
           *  Also, add the action ids to the actions array for later.
           */
          match.actionQueue.forEach((action, index) => {
            const actionItem = document.createElement("li");
            actionItem.textContent = `${index + 1}. ${action.id}`;

            actions.push(action.id);
            actionList.appendChild(actionItem);
          });

          /**
           * Convert the array of actions into a non-repeating array.
           *  The reason this is done is to not have to hard-code the actionQueue names in the for loop below.
           */
          actions = [...new Set(actions)];

          /**
           * Go through the array of actions and then count how many times a action appears.
           */
          for (let i = 0; i < actions.length; i++) {
            let amount = 0;
            match.actionQueue.forEach((action) => {
              if (actions.at(i) === action.id) {
                amount++;
              }
            });
            const actionItem = document.createElement("li");
            actionItem.textContent = `Actions of ${actions.at(i)}: ${amount}`;
            actionList.appendChild(actionItem);
          }
          dropdownContent.appendChild(actionList);
          actions = [];
        } else {
          dropdownContent.textContent = "No actions recorded";
        }

        listItem.appendChild(dropdownContent);

        // Toggle dropdown on button click
        dropdownButton.onclick = () => {
          const isHidden = dropdownContent.style.display === "none";
          dropdownContent.style.display = isHidden ? "block" : "none";
          dropdownButton.textContent = isHidden ? "▼" : "►";
        };

        trashButton.onclick = async () => {
          console.log("Trash button clicked for match id:", match._id);
          if (
            !confirm("Are you sure you want to delete this match performance?")
          ) {
            console.log("Deletion cancelled by user.");
            return;
          }
          console.log("Attempting to delete match with id:", match._id);
          try {
            const response = await fetch(`/analysis/api/dataset/${match._id}`, {
              method: "DELETE",
              headers: {
                Authorization: oldAccessCode || "",
              },
            });
            console.log("Response status:", response.status);
            if (response.ok) {
              console.log("Deletion successful; removing list item.");
              listItem.remove();
            } else {
              const errorText = await response.text();
              console.error(
                "Failed to delete match performance. Server response:",
                errorText,
              );
            }
          } catch (error) {
            console.error("Error encountered during deletion:", error);
          }
        };

        listContainer.appendChild(listItem);
      });

      // Render unscouted placeholders (respect filters)
      unscoutedItems.forEach((item) => {
        const matchValue = matchFilter.value;
        const robotValue = robotFilter.value;

        if (
          (matchValue && item.matchNumber !== Number(matchValue)) ||
          (robotValue && item.robotNumber !== Number(robotValue))
        ) {
          return;
        }

        const listItem = document.createElement("div");
        listItem.classList.add("match-item", "unscouted");

        const topRow = document.createElement("div");
        topRow.classList.add("match-item-top");

        const warningIcon = document.createElement("span");
        warningIcon.textContent = "⚠️";
        warningIcon.style.marginRight = "10px";
        topRow.appendChild(warningIcon);

        const matchNum = document.createElement("span");
        matchNum.textContent = `Match: ${item.matchNumber}`;
        matchNum.classList.add("match-info");
        topRow.appendChild(matchNum);

        const robotNum = document.createElement("span");
        robotNum.textContent = `Robot: ${item.robotNumber}`;
        robotNum.classList.add("match-info");
        topRow.appendChild(robotNum);

        const unscoutedLabel = document.createElement("span");
        unscoutedLabel.textContent = "NOT SCOUTED";
        unscoutedLabel.classList.add("match-info");
        unscoutedLabel.style.marginLeft = "auto";
        topRow.appendChild(unscoutedLabel);

        listItem.appendChild(topRow);

        listItem.style.borderColor =
          item.allianceColor === "red" ? "#ff6666" : "--bg-alt";

        listContainer.appendChild(listItem);
      });
    }

    // Add event listenerss to filters
    scouterFilter.addEventListener("input", updateList);
    matchFilter.addEventListener("input", updateList);
    robotFilter.addEventListener("input", updateList);

    // Initial render
    updateList();
  }

  async function loadAround(func) {
    await func();
  }
})();
