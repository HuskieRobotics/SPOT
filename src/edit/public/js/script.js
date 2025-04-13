let oldAccessCode;
(async () => {
  let dataset;
  console.log("Loading data...");

  function showFade(element) {
    element.classList.add("visible");
  }

  function hideFade(element) {
    element.classList.remove("visible");
  }

  async function executePipeline() {
    // Get tmps from database (or cache if offline)
    let tmps = await fetch("/analysis/api/dataset").then((res) => res.json());

    // Get all tmps stored in the local storage (from qr code)
    const storage = localStorage.getItem("teamMatchPerformances");
    if (storage) {
      // Parse the QR code TMPs (for some reason the array is stored as a string, and each TMP is ALSO
      // stored as a string, so the array has to be parsed and each individual TMP has to be parsed)
      const qrcodeTmps = JSON.parse(storage).map((tmp) => JSON.parse(tmp));

      // Merge the TMPs into one
      tmps = [...tmps, ...qrcodeTmps];
    }

    console.log(tmps);

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
        (res) => res.json()
      );
      dataset = await executePipeline();
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
    scouterFilter.placeholder = "Filter by Scouter ID";
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

    // Filter function
    function updateList() {
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

      // Create items for filtered data
      filteredData.forEach((match) => {
        const listItem = document.createElement("div");
        listItem.classList.add("match-item");

        // Create a container for the top row (arrow, info, and trash)
        const topRow = document.createElement("div");
        topRow.classList.add("match-item-top");

        const dropdownButton = document.createElement("button");
        dropdownButton.textContent = "►";
        dropdownButton.classList.add("dropdown-button");
        topRow.appendChild(dropdownButton);

        const matchInfo = document.createElement("span");
        matchInfo.textContent = `Match: ${match.matchNumber}, Robot: ${match.robotNumber}, Scouter: ${match.scouterId}`;
        matchInfo.classList.add("match-info");
        topRow.appendChild(matchInfo);

        const trashButton = document.createElement("button");
        trashButton.textContent = "🗑️";
        trashButton.classList.add("trash-button");
        topRow.appendChild(trashButton);

        listItem.appendChild(topRow);

        // Add dropdown content after the top row
        const dropdownContent = document.createElement("div");
        dropdownContent.classList.add("dropdown-content");
        dropdownContent.style.display = "none";
        listItem.appendChild(dropdownContent);

        // Format and display actionQueue data
        if (match.actionQueue && match.actionQueue.length > 0) {
          const actionList = document.createElement("ul");
          match.actionQueue.forEach((action, index) => {
            const actionItem = document.createElement("li");
            actionItem.textContent = `${index + 1}. ${action.id}`;
            actionList.appendChild(actionItem);
          });
          dropdownContent.appendChild(actionList);
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
                errorText
              );
            }
          } catch (error) {
            console.error("Error encountered during deletion:", error);
          }
        };

        listContainer.appendChild(listItem);
      });
    }

    // Add event listeners to filters
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
