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

  async function loadAround(func) {
    await func();
  }

  await loadAround(async () => {
    const modulesConfig = await fetch(`/config/analysis-modules.json`).then(
      (res) => res.json()
    );
    dataset = await executePipeline();
    showElements(dataset, modulesConfig);
    await new Promise((r) => setTimeout(r, 300));
  });

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

        const matchInfo = document.createElement("span");
        matchInfo.textContent = `Match: ${match.matchNumber}, Robot: ${match.robotNumber}, Scouter: ${match.scouterId}`;
        listItem.appendChild(matchInfo);

        const trashButton = document.createElement("button");
        trashButton.textContent = "🗑️";
        trashButton.classList.add("trash-button");
        trashButton.onclick = async () => {
          if (
            !confirm("Are you sure you want to delete this match performance?")
          ) {
            return;
          }
          console.log("Deleting", match._id);
          const response = await fetch(`/analysis/api/dataset/${match._id}`, {
            method: "DELETE",
          });
          if (response.ok) {
            listItem.remove();
          } else {
            console.error("Failed to delete match performance");
          }
        };
        listItem.appendChild(trashButton);
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
})();
