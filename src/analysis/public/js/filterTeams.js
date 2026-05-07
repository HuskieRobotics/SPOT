// This function sets up the entire filter system when the filter view loads.
// It receives the team data and a function to fetch team names from the parent page (script.js).
// By passing these in as parameters, we keep this file independent and easy to test.
export function init({ dataset, fetchTeams }) {
  filterTeamState.dataset = dataset;
  filterTeamState.fetchTeams = fetchTeams;
  loadTeamsFilterView();
}

// Shared UI state for team filters.
const filterTeamState = {
  // Tracks whether event listeners have been attached (we only want to attach them once)
  initialized: false,
  // The user's selected action filters (e.g., "activeShift1ShootingRating", "inactive2PassingRating")
  selectedActions: new Set(),
  // The user's selected rating filters (e.g., "Rating4", "eliteOPR")
  selectedRatings: new Set(),
  // The dataset contains the tmps for each team
  dataset: null,
  // A function that fetches the team number-to-name mapping from the server
  fetchTeams: null,
  // A counter that increases each time we refresh the team list; old async requests ignore responses if they're out of date
  renderVersion: 0,
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

// Initializes the entire filter UI (dropdowns, buttons, and team list).
// First checks that we have the required data; if not, exits silently.
function loadTeamsFilterView() {
  // Make sure we received both the team data and the function to fetch team names
  if (
    !filterTeamState.dataset ||
    typeof filterTeamState.fetchTeams !== "function"
  ) {
    return;
  }

  // Set up the filter dropdown menus and attach click listeners
  setupFilterMenus();
  // Load and display the initial list of teams
  loadTeamsForTeamsFilter();
}

// Builds and displays the filter dropdown menus and sets up all the button click handlers.
// This runs every time the filter view is shown, but event listeners are only attached once.
function setupFilterMenus() {
  // Grab references to the filter buttons and dropdown menus from the HTML
  const actionButton = document.getElementById("robot-action-button");
  const actionDropdown = document.getElementById("robot-action-dropdown");
  const ratingButton = document.getElementById("action-rating-button");
  const ratingDropdown = document.getElementById("action-rating-dropdown");

  // If the HTML is missing any of these elements, we can't set up filters, so bail out
  if (!actionButton || !actionDropdown || !ratingButton || !ratingDropdown) {
    return;
  }

  // Extract all unique action names from the team data (e.g., "shooterSpeed", "climbHeight")
  const actionOptions = extractActionOptions(filterTeamState.dataset);
  // Render the action filter checkboxes in the dropdown
  renderFilterOptions(
    actionDropdown,
    actionOptions,
    filterTeamState.selectedActions,
    "action",
  );
  // Render the pre-defined rating filter checkboxes (Rating1-4, OPR bands) in the dropdown
  renderFilterOptions(
    ratingDropdown,
    ratingBands,
    filterTeamState.selectedRatings,
    "rating",
  );

  // Only attach event listeners once; running this function again shouldn't add duplicate listeners
  if (!filterTeamState.initialized) {
    // Helper function: opens a dropdown and closes the other one (only one dropdown visible at a time)
    const openMenu = (button, dropdown) => {
      // Check if this dropdown is already open
      const isOpen = dropdown.style.display === "block";
      // Close both dropdowns and remove the open styling from both buttons
      [actionDropdown, ratingDropdown].forEach(
        (d) => (d.style.display = "none"),
      );
      [actionButton, ratingButton].forEach((b) =>
        b.classList.remove("menu-open"),
      );

      // If the dropdown wasn't already open, open it and style the button
      if (!isOpen) {
        dropdown.style.display = "block";
        button.classList.add("menu-open");
      }
    };

    // When the action filter button is clicked, toggle its dropdown
    actionButton.addEventListener("click", (event) => {
      // Stop the click from bubbling up to the document listener (which would close the menu)
      event.stopPropagation();
      openMenu(actionButton, actionDropdown);
    });

    // When the rating filter button is clicked, toggle its dropdown
    ratingButton.addEventListener("click", (event) => {
      // Stop the click from bubbling up to the document listener (which would close the menu)
      event.stopPropagation();
      openMenu(ratingButton, ratingDropdown);
    });

    // Close both filter dropdowns if the user clicks anywhere outside the filter area
    document.addEventListener("click", (event) => {
      // Get the filter navbar container
      const filterNav = document.getElementById("filter-navbar");
      // If the click happened outside the filter navbar, close all dropdowns
      if (filterNav && !filterNav.contains(event.target)) {
        [actionDropdown, ratingDropdown].forEach(
          (d) => (d.style.display = "none"),
        );
        [actionButton, ratingButton].forEach((b) =>
          b.classList.remove("menu-open"),
        );
      }
    });

    // Mark that event listeners have been attached so we don't add them again
    filterTeamState.initialized = true;
  }

  // Display the filter chips (tags) that show which filters are currently active
  renderSelectedFilterChips();
}

// Returns the Set (action or rating) that corresponds to the given filter type.
// This is a helper to avoid writing the same conditional in multiple places.
function getSelectedFilterSet(type) {
  // Return the appropriate Set based on the filter type
  return type === "action"
    ? filterTeamState.selectedActions
    : filterTeamState.selectedRatings;
}

// Updates the selected filters when the user checks or unchecks a filter option.
// Centralized in one place so both checkboxes and chips work the same way.
function setFilterSelection(type, value, isSelected) {
  // Get the correct Set for this filter type
  const selectedSet = getSelectedFilterSet(type);
  // Add the filter value if selected, or remove it if deselected
  if (isSelected) {
    selectedSet.add(value);
  } else {
    selectedSet.delete(value);
  }
}

// Scans the team data and builds a list of all unique action metrics (e.g., "shooterSpeed", "climbHeight").
// These become the checkboxes in the action filter dropdown.
function extractActionOptions(dataset) {
  // Use a Set to automatically remove duplicates as we find action names
  const actions = new Set();
  // Loop through each team in the dataset
  for (const team of Object.values(dataset.teams)) {
    // Check both the averageScores and opr objects for action names
    for (const source of [team.averageScores, team.opr]) {
      // Skip if this source doesn't exist or isn't an object
      if (!source || typeof source !== "object") {
        continue;
      }
      // Add each action name to our Set
      for (const key of Object.keys(source)) {
        actions.add(key);
      }
    }
  }

  // Convert the Set to a sorted array and format each action for display
  return Array.from(actions)
    .sort((a, b) => a.localeCompare(b))
    .map((action) => ({ id: action, label: toTitleCase(action) }));
}

// Converts strings to display them better.
function toTitleCase(input) {
  return input
    .replace(/[_-]/g, " ") // Replace underscores and dashes with spaces
    .trim() // Remove leading/trailing whitespace
    .split(/\s+/) // Split on one or more spaces
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalize first letter of each word
    .join(" "); // Join words back together with spaces
}

// Builds and displays a list of filter checkboxes (for either actions or ratings) and attaches event listeners.
function renderFilterOptions(container, options, selectedSet, type) {
  // Clear out any old checkboxes that were previously rendered
  container.innerHTML = "";
  // Create a checkbox for each available filter option
  for (const option of options) {
    // Create a label containing the checkbox and its text
    const optionLabel = createDOMElement("label", "filter-option");
    // Create the checkbox input element
    const checkbox = createDOMElement("input");
    checkbox.type = "checkbox";
    // Check the box if this option is already selected
    checkbox.checked = selectedSet.has(option.id);
    // Store the filter type and value as data attributes for easy retrieval
    checkbox.dataset.filterType = type;
    checkbox.dataset.filterValue = option.id;

    // When the user checks or unchecks this box, update the filter state and refresh the team list
    checkbox.addEventListener("change", () => {
      setFilterSelection(type, option.id, checkbox.checked);
      renderSelectedFilterChips();
      updateTeamsFilterUI();
    });

    // Create a text label for the checkbox
    const text = createDOMElement("span");
    text.innerText = option.label;

    // Add the checkbox and text to the label, then add the label to the container
    optionLabel.appendChild(checkbox);
    optionLabel.appendChild(text);
    container.appendChild(optionLabel);
  }
}

// Applies the current filters and returns only the teams that match.
// Note: This just returns the data; it doesn't update the page (that's updateTeamsFilterUI's job).
function collectFilteredTeams() {
  // Get all teams from the dataset as [teamNumber, teamData] pairs
  const allTeamsArray = Object.entries(filterTeamState.dataset.teams);
  // Filter to keep only teams that match the current selection
  const filteredTeams = allTeamsArray.filter(([, team]) => {
    return teamMatchesFilter(team);
  });
  // Debug logging
  // console.log("All Teams:", allTeamsArray);
  // console.log("Selected Actions:", filterTeamState.selectedActions);
  // console.log("Selected Ratings:", filterTeamState.selectedRatings);
  // console.log("number of teams matching filter:", filteredTeams.length);
  // console.log("Filtered Teams:", filteredTeams);
  return filteredTeams;
}

// Clears the current team display and reloads it based on the selected filters.
function updateTeamsFilterUI() {
  // Find the HTML container where the team cards will be displayed
  const containerForTeams = document.getElementById(
    "main-team-container-for-teams-filter",
  );
  if (!containerForTeams) return;

  // Increment the version counter; if a new request comes in before this one finishes, this version will be ignored
  const renderVersion = ++filterTeamState.renderVersion;
  // Clear the old team cards
  containerForTeams.innerHTML = "";

  // Fetch the team name mapping from the server (async operation)
  filterTeamState.fetchTeams().then((allTeams) => {
    // If a new filter request came in while we were waiting, ignore this stale response
    if (renderVersion !== filterTeamState.renderVersion) {
      return;
    }

    // Decide which teams to show: either all teams or just the filtered ones
    let teamsToShow;
    if (
      filterTeamState.selectedActions.size === 0 &&
      filterTeamState.selectedRatings.size === 0
    ) {
      // No filters active, show all teams
      teamsToShow = Object.entries(filterTeamState.dataset.teams);
    } else {
      // At least one filter is active, apply the filters
      teamsToShow = collectFilteredTeams();
    }
    // Create a team card for each team and add it to the page
    for (const [teamNumber] of teamsToShow) {
      const teamContainer = constructTeamForTeamsFilter(teamNumber, allTeams);
      containerForTeams.appendChild(teamContainer);
    }
  });
}

// Displays the filter "chips" (small removable tags) that show which filters are currently active.
function renderSelectedFilterChips() {
  // Find the container where the filter chips will be displayed
  const chipsContainer = document.getElementById("selected-filter-chips");
  if (!chipsContainer) {
    return;
  }

  // Clear out old chips
  chipsContainer.innerHTML = "";

  // Combine selected actions and ratings into a single list for display
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

  // Create a chip for each selected filter
  for (const item of selectedItems) {
    // Create the chip container
    const chip = createDOMElement("div", "filter-chip");
    // Add the filter name as text inside the chip
    const chipText = createDOMElement("span");
    chipText.innerText = item.label;

    // Create the X button to remove this filter
    const removeButton = createDOMElement("button", "filter-chip-remove");
    removeButton.type = "button";
    removeButton.innerText = "x";
    // When clicked, remove this filter and update the UI
    removeButton.addEventListener("click", () => {
      // Remove the filter from our state
      setFilterSelection(item.type, item.id, false);

      // Also uncheck the corresponding checkbox so the UI stays in sync
      const checkbox = document.querySelector(
        `input[data-filter-type="${item.type}"][data-filter-value="${item.id}"]`,
      );
      if (checkbox) {
        checkbox.checked = false;
      }

      // Refresh the chips and team list
      renderSelectedFilterChips();
      updateTeamsFilterUI();
    });

    // Assemble the chip from text and button
    chip.appendChild(chipText);
    chip.appendChild(removeButton);
    // Add the chip to the page
    chipsContainer.appendChild(chip);
  }
}

// Initial load of the team list when the filter view first opens.
function loadTeamsForTeamsFilter() {
  updateTeamsFilterUI();
}

// Builds a clickable team card showing the team number and optionally the team name.
function constructTeamForTeamsFilter(teamNumber, allTeams) {
  // Create the main container for this team card
  const teamContainer = createDOMElement("div", "team-container");

  // Create and add the team number display
  const teamNumDisplay = createDOMElement("div", "team-number");
  teamNumDisplay.innerText = teamNumber;
  teamContainer.appendChild(teamNumDisplay);

  // If we have the team name, add it to the card as well
  if (allTeams && allTeams[teamNumber]) {
    const teamNameDisplay = createDOMElement("div", "team-name");
    teamNameDisplay.innerText = allTeams[teamNumber];
    teamContainer.appendChild(teamNameDisplay);
  }

  return teamContainer;
}

// Checks whether a given team satisfies the current filter selections.
// The logic changes depending on which types of filters are active (actions only, ratings only, or both).
function teamMatchesFilter(team) {
  // Convert Sets to arrays for easier processing
  const selectedActions = Array.from(filterTeamState.selectedActions);
  const selectedRatings = Array.from(filterTeamState.selectedRatings);

  // If no filters are selected, all teams match
  if (selectedActions.length === 0 && selectedRatings.length === 0) {
    return true;
  }

  // If only action filters are selected, the team must have positive values for all selected actions
  if (selectedActions.length > 0 && selectedRatings.length === 0) {
    return selectedActions.every((action) => {
      // Get the team's value for this action
      const value = Number(getTeamActionValue(team, action));
      // Team matches if the value exists and is positive
      return !Number.isNaN(value) && value > 0;
    });
  }

  // If only rating filters are selected
  if (selectedActions.length === 0 && selectedRatings.length > 0) {
    // Check if the user selected numerical ratings (Rating1-4) which work as a threshold
    const ratingThreshold = getSelectedRatingThreshold(selectedRatings);
    if (ratingThreshold != null) {
      // Get all the positive action ratings for this team
      const positiveActionRatings = getPositiveRobotActionRatings(team);
      // Team matches if it has positive ratings and all of them meet the threshold
      return (
        positiveActionRatings.length > 0 &&
        positiveActionRatings.every((value) => value >= ratingThreshold)
      );
    }

    // If ratings are OPR bands (not Rating1-4), check if the team's OPR/score values fall into the selected bands
    return (
      Object.entries(team.averageScores || {}).some(([, value]) =>
        selectedRatings.some((ratingId) =>
          valueMatchesRatingBand(value, ratingId),
        ),
      ) ||
      Object.entries(team.opr || {}).some(([, value]) =>
        selectedRatings.some((ratingId) =>
          valueMatchesRatingBand(value, ratingId),
        ),
      )
    );
  }

  // If both actions and ratings are selected, each action must exist (>0) and its value must match one of the rating bands
  return selectedActions.every((action) => {
    // Get the team's value for this action
    const value = Number(getTeamActionValue(team, action));
    // If value is missing or zero, this action doesn't match
    if (Number.isNaN(value) || value <= 0) {
      return false;
    }
    // Check if the value falls into one of the selected rating bands
    return selectedRatings.some((ratingId) =>
      valueMatchesRatingBand(value, ratingId),
    );
  });
}

// Retrieves a team's value for a specific action, checking both averageScores and OPR data.
function getTeamActionValue(team, action) {
  // First check if the action exists in the team's averageScores
  if (team.averageScores && team.averageScores[action] != null) {
    return team.averageScores[action];
  }
  // If not found, check the OPR data
  if (team.opr && team.opr[action] != null) {
    return team.opr[action];
  }
  // If not found anywhere, return null
  return null;
}

// If the user selected rating bands like Rating1-4, converts them to numeric thresholds.
// Returns null if the ratings are a mix of types (can't be converted to a single threshold).
function getSelectedRatingThreshold(selectedRatings) {
  // Map rating names to their numeric thresholds
  const ratingThresholdMap = {
    Rating1: 1,
    Rating2: 2,
    Rating3: 3,
    Rating4: 4,
  };

  // Convert each selected rating to its numeric threshold
  const thresholds = selectedRatings
    .map((ratingId) => ratingThresholdMap[ratingId])
    .filter((value) => value != null);

  // If we couldn't convert all ratings (e.g., some are OPR bands), return null
  if (thresholds.length !== selectedRatings.length || thresholds.length === 0) {
    return null;
  }

  // Return the highest threshold (strictest requirement)
  return Math.max(...thresholds);
}

// Extracts all action ratings for each specific action that has been recorded for that team.
function getPositiveRobotActionRatings(team) {
  const actionRatings = [];
  // Loop through all the ratings for each specific action ID in the team's averageScores
  for (const value of Object.values(team.averageScores || {})) {
    const numericValue = Number(value);
    // Skip ratings that do not exist, are 0, or negative
    if (Number.isNaN(numericValue) || numericValue <= 0) {
      continue;
    }
    // Add positive scores to the list
    actionRatings.push(numericValue);
  }
  return actionRatings;
}

// Checks whether a numeric value falls into a specific rating band or range.
function valueMatchesRatingBand(value, ratingId) {
  // Convert value to a number
  const num = Number(value);
  // Invalid values don't match any band
  if (Number.isNaN(num)) {
    return false;
  }

  // Check which band the value falls into
  switch (ratingId) {
    // Numerical ratings are minimum thresholds
    case "Rating4":
      return num === 4.0; // Exactly 4.0
    case "Rating3":
      return num >= 3.0; // 3.0 or higher
    case "Rating2":
      return num >= 2.0; // 2.0 or higher
    case "Rating1":
      return num >= 1.0; // 1.0 or higher
    // OPR bands are specific ranges
    case "eliteOPR":
      return num >= 250.0; // 250 and up
    case "strongOPR":
      return num >= 151.0 && num <= 250.0; // 151 to 250
    case "decentOPR":
      return num >= 101.0 && num <= 150.0; // 101 to 150
    case "lowOPR":
      return num >= 0.0 && num <= 100.0; // 0 to 100
    case "negativeOPR":
      return num < 0.0; // Below 0
    default:
      return false;
  }
}
