/**
 * Loads a new configuration file mid-match and rebuilds the UI without losing state
 * @param button The button that triggered this executable
 * @param layers The current layers array
 * @param configPath The path to the new config file (e.g., "match-scouting-2025.json")
 * @param targetLayer (Optional) Specific layer to show after loading. If not provided, determines layer based on current time
 */
executables["loadConfig"] = {
  execute: async function (button, layers, configPath, targetLayer) {
    try {
      // Helper function to get current visible layer
      const getCurrentLayer = () => {
        if (!window.matchScoutingConfig || !window.matchScoutingConfig.layout) {
          return 0;
        }

        const layers = window.matchScoutingConfig.layout.layers;
        for (let i = 0; i < layers.length; i++) {
          const layerButtons = layers[i];
          if (
            layerButtons.some(
              (btn) => btn.element && btn.element.style.display !== "none",
            )
          ) {
            return i;
          }
        }
        return 0;
      };

      // Store history for potential undo
      if (!window.configHistory) {
        window.configHistory = [];
      }
      window.configHistory.push({
        config: window.matchScoutingConfig,
        configPath: window.currentConfigPath,
        layer: getCurrentLayer(),
      });

      // Fetch the new configuration
      const response = await fetch(`/config/${configPath}`);
      if (!response.ok) {
        throw new Error(`Failed to load config: ${response.statusText}`);
      }
      const newConfig = await response.json();

      // Update the global config reference
      window.matchScoutingConfig = newConfig;
      matchScoutingConfig = newConfig;
      window.currentConfigPath = configPath;

      // Update grid dimensions
      const grid = document.querySelector("#match-scouting .button-grid");
      grid.style.gridTemplateColumns = `repeat(${newConfig.layout.gridColumns}, 1fr)`;
      grid.style.gridTemplateRows = `repeat(${newConfig.layout.gridRows}, 1fr)`;

      // Clear existing grid
      grid.innerHTML = "";

      // Build new buttons from the new config
      const newLayers = deepClone(newConfig.layout.layers);
      const newButtons = newLayers.flat();

      // Create button elements for the new config
      for (const button of newButtons) {
        const buttonElement = document.createElement("div");

        // Give the button element its properties
        buttonElement.innerText = button.displayText || button.id;
        buttonElement.classList.add("grid-button", ...button.class.split(" "));
        buttonElement.style.gridArea = button.gridArea.join(" / ");

        button.element = buttonElement;
        button.executables = button.executables || [];
        grid.appendChild(buttonElement);
      }

      // Rebuild buttons with event listeners using the exposed function
      if (window.rebuildButtons) {
        window.rebuildButtons(newButtons, newLayers);
      }

      // Determine layer based on timer state
      let layerToShow = 0; // Default to layer 0
      if (targetLayer !== undefined) {
        layerToShow = targetLayer;
      } else if (window.currentTime !== undefined) {
        // Find which transition the current time falls into.
        // Use ascending thresholds and pick the first threshold >= currentTime
        const transitions = Object.keys(newConfig.timing.timeTransitions || {})
          .map(Number)
          .sort((a, b) => a - b); // ascending

        for (const t of transitions) {
          if (window.currentTime <= t) {
            layerToShow = newConfig.timing.timeTransitions[t].layer;
            break;
          }
        }
      }

      // Validate layer exists in new config, default to 0 if not
      if (layerToShow >= newLayers.length || layerToShow < 0) {
        console.warn(
          `Layer ${layerToShow} does not exist in new config. Defaulting to layer 0.`,
        );
        layerToShow = 0;
      }

      // Show the appropriate layer
      if (window.showLayer) {
        window.showLayer(layerToShow);
      }

      console.log(
        `Loaded config: ${configPath}, showing layer: ${layerToShow}`,
      );
    } catch (error) {
      console.error("Error loading config:", error);
      new Popup("error", `Failed to load config: ${error.message}`, 3000);
    }
  },

  reverse: function (button, layers, configPath, targetLayer) {
    // Restore previous config from history
    if (window.configHistory && window.configHistory.length > 0) {
      const previous = window.configHistory.pop();

      // Restore config
      window.matchScoutingConfig = previous.config;
      matchScoutingConfig = previous.config;
      window.currentConfigPath = previous.configPath;

      // Update grid dimensions
      const grid = document.querySelector("#match-scouting .button-grid");
      grid.style.gridTemplateColumns = `repeat(${previous.config.layout.gridColumns}, 1fr)`;
      grid.style.gridTemplateRows = `repeat(${previous.config.layout.gridRows}, 1fr)`;

      // Clear and rebuild grid
      grid.innerHTML = "";

      const restoredLayers = deepClone(previous.config.layout.layers);
      const restoredButtons = restoredLayers.flat();

      // Create button elements
      for (const button of restoredButtons) {
        const buttonElement = document.createElement("div");

        // Give the button element its properties
        buttonElement.innerText = button.displayText || button.id;
        buttonElement.classList.add("grid-button", ...button.class.split(" "));
        buttonElement.style.gridArea = button.gridArea.join(" / ");

        button.element = buttonElement;
        button.executables = button.executables || [];
        grid.appendChild(buttonElement);
      }

      // Rebuild buttons
      if (window.rebuildButtons) {
        window.rebuildButtons(restoredButtons, restoredLayers);
      }

      // Show previous layer (validate it exists)
      let layerToShow = previous.layer;
      if (layerToShow >= restoredLayers.length || layerToShow < 0) {
        console.warn(
          `Layer ${layerToShow} does not exist. Defaulting to layer 0.`,
        );
        layerToShow = 0;
      }
      if (window.showLayer) {
        window.showLayer(layerToShow);
      }

      console.log(`Restored config: ${previous.configPath}`);
    }
  },
};
