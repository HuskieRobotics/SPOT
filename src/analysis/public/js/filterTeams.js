// Entry point for initializing the filter view from outside this module
export function init(dataset, modulesConfig) {
  // clearInterface();
  // loadTeams(dataset, modulesConfig);
  // filterTeamsSwitch.classList.add("selected");
  // showFade(filterTeamsView);
  // setupFilterMenus(dataset);
  // loadTeamsForTeamsFilter(dataset);
  loadTeamsFilterView(dataset, modulesConfig);
}

// Shared UI state for team filters. Set is used for O(1)-style add/remove/has checks.
const filterTeamState = {
  initialized: false,
  selectedActions: new Set(),
  selectedRatings: new Set(),
};

// Static rating options used to populate the rating dropdown.
const ratingBands = [
  { id: "Rating4", label: "Rating4" },
  { id: "Rating3", label: "Rating3" },
  { id: "Rating2", label: "Rating2" },
  { id: "Rating1", label: "Rating1" },
  { id: "eliteOPR", label: "Elite OPR (250+)" },
  { id: "strongOPR", label: "Strong OPR (151-250)" },
  { id: "decentOPR", label: "Decent OPR (101-150)" },
  { id: "lowOPR", label: "Low OPR (0-100)" },
  { id: "negativeOPR", label: "Negative OPR" },
];

// This function adds an event listener to the filterTeamsSwitch button.
// If this is called multiple times, it will add multiple listeners, which can cause duplicate UI updates or bugs.
// Only call this ONCE per page load.
async function loadTeamsFilterView(dataset, modulesConfig) {
  // WARNING: If this is called more than once, multiple event listeners will be attached!

  // clearInterface();
  // loadTeams(dataset, modulesConfig);
  // filterTeamsSwitch.classList.add("selected");
  // showFade(filterTeamsView);
  setupFilterMenus(dataset);
  loadTeamsForTeamsFilter(dataset);
}

// Sets up the filter dropdowns and their event listeners
function setupFilterMenus(dataset) {
  // Resolve filter controls once each time this view is shown.
  const actionButton = document.getElementById("robot-action-button");
  const actionDropdown = document.getElementById("robot-action-dropdown");
  const ratingButton = document.getElementById("action-rating-button");
  const ratingDropdown = document.getElementById("action-rating-dropdown");

  if (!actionButton || !actionDropdown || !ratingButton || !ratingDropdown) {
    // If any filter UI element is missing, filtering will not work
    return;
  }

  // Build option lists: action list is dynamic from data, rating list is fixed from ratingBands.
  const actionOptions = extractActionOptions(dataset);
  renderFilterOptions(
    actionDropdown,
    actionOptions,
    filterTeamState.selectedActions,
    "action",
  );
  renderFilterOptions(
    ratingDropdown,
    ratingBands,
    filterTeamState.selectedRatings,
    "rating",
  );

  if (!filterTeamState.initialized) {
    // This block ensures event listeners are only added once.
    // Keep only one menu open at a time by closing both before opening the requested one.
    const openMenu = (button, dropdown) => {
      const isOpen = dropdown.style.display === "block";
      [actionDropdown, ratingDropdown].forEach(
        (d) => (d.style.display = "none"),
      );
      [actionButton, ratingButton].forEach((b) =>
        b.classList.remove("menu-open"),
      );

      if (!isOpen) {
        dropdown.style.display = "block";
        button.classList.add("menu-open");
      }
    };

    actionButton.addEventListener("click", (event) => {
      // Prevent document click handler from immediately closing the menu.
      event.stopPropagation();
      openMenu(actionButton, actionDropdown);
    });

    ratingButton.addEventListener("click", (event) => {
      // Prevent document click handler from immediately closing the menu.
      event.stopPropagation();
      openMenu(ratingButton, ratingDropdown);
    });

    document.addEventListener("click", (event) => {
      // Close menus when clicking outside the filter navbar.
      const filterNav = document.getElementById("filter-navbar");
      if (filterNav && !filterNav.contains(event.target)) {
        [actionDropdown, ratingDropdown].forEach(
          (d) => (d.style.display = "none"),
        );
        [actionButton, ratingButton].forEach((b) =>
          b.classList.remove("menu-open"),
        );
      }
    });

    filterTeamState.initialized = true;
    // If you ever need to reset the filter UI, you must also reset this flag.
  }

  renderSelectedFilterChips();
}

// Returns the correct Set for the filter type
// If you add more filter types, update this function
function getSelectedFilterSet(type) {
  // Route filter operations to the correct Set based on filter type.
  return type === "action"
    ? filterTeamState.selectedActions
    : filterTeamState.selectedRatings;
}

// Adds or removes a value from the selected filter set
function setFilterSelection(type, value, isSelected) {
  // Single mutation helper for checkbox and chip interactions.
  const selectedSet = getSelectedFilterSet(type);
  if (isSelected) {
    selectedSet.add(value);
  } else {
    selectedSet.delete(value);
  }
}

// Gathers all unique action keys from the dataset for the filter dropdown
function extractActionOptions(dataset) {
  // Collect unique action keys from both averageScores and opr using Set + nested loops.
  const actions = new Set();
  for (const team of Object.values(dataset.teams)) {
    for (const source of [team.averageScores, team.opr]) {
      if (!source || typeof source !== "object") {
        continue;
      }
      for (const key of Object.keys(source)) {
        actions.add(key);
      }
    }
  }

  // Convert to sorted UI options using map for label formatting.
  return Array.from(actions)
    .sort((a, b) => a.localeCompare(b))
    .map((action) => ({ id: action, label: toTitleCase(action) }));
}

// Renders the filter checkboxes and attaches change listeners
// WARNING: If this is called repeatedly without clearing old listeners, you may get duplicate events.
function renderFilterOptions(container, options, selectedSet, type) {
  container.innerHTML = "";
  for (const option of options) {
    const optionLabel = createDOMElement("label", "filter-option");
    const checkbox = createDOMElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedSet.has(option.id);
    checkbox.dataset.filterType = type;
    checkbox.dataset.filterValue = option.id;

    checkbox.addEventListener("change", () => {
      setFilterSelection(type, option.id, checkbox.checked);
      renderSelectedFilterChips();
      updateTeamsFilterUI(); // Update the UI immediately when filters change
    });

    const text = createDOMElement("span");
    text.innerText = option.label;

    optionLabel.appendChild(checkbox);
    optionLabel.appendChild(text);
    container.appendChild(optionLabel);
  }
}

// This function returns the filtered teams as an array
// It does NOT update the UI by itself
function collectFilteredTeams() {
  const allTeamsArray = Object.entries(dataset.teams);
  const filteredTeams = allTeamsArray.filter(([teamNumber, team]) => {
    return teamMatchesFilter(team);
  });
  console.log("All Teams:", allTeamsArray);
  console.log("Selected Actions:", filterTeamState.selectedActions);
  console.log("Selected Ratings:", filterTeamState.selectedRatings);
  console.log("number of teams matching filter:", filteredTeams.length);
  console.log("Filtered Teams:", filteredTeams);
  return filteredTeams;
}

// Updates the teams UI based on the current filter state
function updateTeamsFilterUI() {
  const containerForTeams = document.getElementById(
    "main-team-container-for-teams-filter",
  );
  if (!containerForTeams) return;
  // containerForTeams.innerHTML = "";
  fetchTeams().then((allTeams) => {
    let teamsToShow;
    if (
      filterTeamState.selectedActions.size === 0 &&
      filterTeamState.selectedRatings.size === 0
    ) {
      teamsToShow = Object.entries(dataset.teams);
    } else {
      teamsToShow = collectFilteredTeams();
    }
    for (const [teamNumber, team] of teamsToShow) {
      if (teamsToShow.includes(teamNumber)) {
        const teamContainer = constructTeamForTeamsFilter(teamNumber, allTeams);
        containerForTeams.appendChild(teamContainer);
      }
    }
  });
}

// Renders the chips (tags) for selected filters
function renderSelectedFilterChips() {
  // Chips are derived UI: generated from selected Sets rather than stored separately.
  const chipsContainer = document.getElementById("selected-filter-chips");
  if (!chipsContainer) {
    return;
  }

  chipsContainer.innerHTML = "";

  // Spread + map merges action and rating selections into one render list.
  const selectedItems = [
    ...Array.from(filterTeamState.selectedActions).map((id) => ({
      type: "action",
      id,
      label: toTitleCase(id),
    })),
    ...Array.from(filterTeamState.selectedRatings).map((id) => ({
      type: "rating",
      id,
      label: ratingBands.find((rating) => rating.id === id)?.label || id,
    })),
  ];

  for (const item of selectedItems) {
    const chip = createDOMElement("div", "filter-chip");
    const chipText = createDOMElement("span");
    chipText.innerText = item.label;

    const removeButton = createDOMElement("button", "filter-chip-remove");
    removeButton.type = "button";
    removeButton.innerText = "x";
    removeButton.addEventListener("click", () => {
      // Removing a chip updates Set state and mirrors that change back to the checkbox.
      setFilterSelection(item.type, item.id, false);

      const checkbox = document.querySelector(
        `input[data-filter-type="${item.type}"][data-filter-value="${item.id}"]`,
      );
      if (checkbox) {
        checkbox.checked = false;
      }

      renderSelectedFilterChips();
    });

    chip.appendChild(chipText);
    chip.appendChild(removeButton);
    chipsContainer.appendChild(chip);
  }
}

// Loads the teams UI for the filter view (called once when entering the view)
async function loadTeamsForTeamsFilter(dataset) {
  updateTeamsFilterUI();
}

// Creates a DOM element for a team card
function constructTeamForTeamsFilter(teamNumber, allTeams) {
  // get the main container on the page by the container's ID
  // const mainTeamContainer = document.getElementById(
  //   "main-team-container-for-teams-filter",
  // );

  // create a new div element for each specific team name
  const teamContainer = createDOMElement("div", "team-container");

  // create a div element for each specific team number and set the text of the div to the team number, then append it to the container for the team
  const teamNumDisplay = createDOMElement("div", "team-number");
  teamNumDisplay.innerText = teamNumber;

  teamContainer.appendChild(teamNumDisplay);

  if (allTeams && allTeams[teamNumber]) {
    // create a div element for each specific team name and set the text of the div to the team name, then append it to the container for the team
    const teamNameDisplay = createDOMElement("div", "team-name");
    teamNameDisplay.innerText = allTeams[teamNumber];
    teamContainer.appendChild(teamNameDisplay);
  }

  return teamContainer; //return the container created for the specific team
}

// Returns true if a team matches the selected filters
function teamMatchesFilter(team) {
  if (
    filterTeamState.selectedActions.size === 0 ||
    filterTeamState.selectedRatings.size === 0
  ) {
    return true; // If no filters, show all teams
  }
  return Array.from(filterTeamState.selectedActions).every((action) => {
    const value = team.averageScores?.[action] ?? team.opr?.[action];
    return filterTeamState.selectedRatings.has(String(value));
  });
}
