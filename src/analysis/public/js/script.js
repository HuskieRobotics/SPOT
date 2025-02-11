// Existing top variable declarations (modified section)
const matchViewSwitch = document.getElementById("match-view-switch");
const autoPickSwitch = document.getElementById("auto-pick-switch");
const bubbleSheetSwitch = document.getElementById("bubble-sheet-switch");
const switchEvent = document.getElementById("switchEvent");
const eventView = document.getElementById("event-view");

// ... (other existing variable declarations remain unchanged)

(async () => {
  // ... existing initialization code

  // Add event listener for the new "Switch Event" button
  switchEvent.addEventListener("click", () => {
    clearInterface();
    // Mark only the switchEvent button as selected
    switchEvent.classList.add("selected");
    matchViewSwitch.classList.remove("selected");
    autoPickSwitch.classList.remove("selected");
    bubbleSheetSwitch.classList.remove("selected");
    // Show the event view container
    showFade(eventView);
  });

  // ... rest of the code remains unchanged

  // In clearInterface, add hiding of the event view:
  function clearInterface() {
    Array.from(document.querySelector("#team-list").children).map((t) =>
      t.classList.remove("selected")
    );

    hideFade(welcomeView);
    hideFade(matchView);
    hideFade(teamView);
    hideFade(autoPickView);
    hideFade(bubbleSheetView);
    hideFade(eventView);
    // reset button selections
    matchViewSwitch.classList.remove("selected");
    autoPickSwitch.classList.remove("selected");
    bubbleSheetSwitch.classList.remove("selected");
    switchEvent.classList.remove("selected");
  }

  // ... rest of the script.js code remains unchanged
})();