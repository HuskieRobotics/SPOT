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
    // Assuming dataset is an array of match performances
    const listContainer = document.getElementById("match-list");
    listContainer.innerHTML = ""; // Clear any existing content

    // Sort dataset by date, assuming each item has a 'date' property
    dataset.sort((a, b) => b.timestamp - a.timestamp);

    // Create list items for each match performance
    dataset.forEach((match) => {
      const listItem = document.createElement("div");
      listItem.classList.add("match-item");

      const matchInfo = document.createElement("span");
      matchInfo.textContent = `Match: ${match.matchNumber}, Robot: ${match.robotNumber}, Scouter: ${match.scouterId}`;
      listItem.appendChild(matchInfo);

      const trashButton = document.createElement("button");
      trashButton.textContent = "🗑️";
      trashButton.classList.add("trash-button");
      trashButton.onclick = async () => {
        const response = await fetch(`./api/dataset/${match.id}`, {
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
})();
