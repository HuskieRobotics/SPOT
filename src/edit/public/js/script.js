(async () => {
  let dataset;

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
      const listItem = document.createElement("li");
      listItem.textContent = `Match: ${match.matchNumber}, Robot: ${match.robotNumber}, Scouter: ${match.scouterID}`;
      listContainer.appendChild(listItem);
    });
  }
})();
