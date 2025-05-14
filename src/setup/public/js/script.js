//unregister all service workers (if they exist)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(function (registrations) {
    //returns installed service workers
    if (registrations.length) {
      for (let registration of registrations) {
        registration.unregister();
      }
    }
  });
}

let oldAccessCode;
(async () => {
  const authRequest = await fetch("./api/auth").then((res) => res.json());

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
    const auth = await fetch("./api/auth", {
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
})();

async function constructApp(accessCode) {
  const config = (
    await fetch("./api/config", {
      headers: {
        Authorization: accessCode,
      },
    }).then((res) => res.json())
  ).config;

  if (config) {
    document.querySelector("#ACCESS_CODE").value =
      config.secrets.ACCESS_CODE || "";
    document.querySelector("#DATABASE_URL").value =
      config.secrets.DATABASE_URL || "";
    await populateEventNumbers();
    document.querySelector("#TBA_API_KEY").value =
      config.secrets.TBA_API_KEY || "";
    document.querySelector("#TBA_EVENT_KEY").value = config.TBA_EVENT_KEY || "";
    document.querySelector("#FMS_API_USERNAME").value =
      config.secrets.FMS_API_USERNAME || "";
    document.querySelector("#FMS_API_KEY").value =
      config.secrets.FMS_API_KEY || "";
    document.querySelector("#GOOGLE_CLIENT_ID").value =
      config.GOOGLE_CLIENT_ID || "";
    document.querySelector("#GOOGLE_CLIENT_SECRET").value =
      config.GOOGLE_CLIENT_SECRET || "";
    document.querySelector("#EVENT_NUMBER").value = config.EVENT_NUMBER || "";
    if (config.DEMO) {
      document.querySelector("#DEMO").value = config.DEMO;
      document.querySelector("#DEMO").checked = true;
    } else {
      document.querySelector("#DEMO").value = 0;
      document.querySelector("#DEMO").checked = false;
    }
  }

  document.querySelector("#setup-container").classList.add("visible");
}

// When the select element is focused, remove the placeholder option if it's still there.
const eventSelect = document.getElementById("EVENT_NUMBER");
if (eventSelect) {
  eventSelect.addEventListener("focus", function () {
    const defaultOption = eventSelect.querySelector("option[value='']");
    if (defaultOption) {
      defaultOption.remove();
    }
  });

  // Optionally, if no selection was made, add the default option back on blur.
  eventSelect.addEventListener("blur", function () {
    if (
      eventSelect.value === "" &&
      !eventSelect.querySelector("option[value='']")
    ) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select Event Number";
      eventSelect.insertBefore(placeholder, eventSelect.firstChild);
    }
  });
}
async function checkEventNumber(candidate) {
  const databaseUrl = document.getElementById("DATABASE_URL").value;
  if (!databaseUrl) {
    console.error("DATABASE_URL not set");
    return false;
  }
  const res = await fetch(
    `/setup/api/check-event-number?databaseUrl=${encodeURIComponent(
      databaseUrl
    )}&eventNumber=${encodeURIComponent(candidate)}`
  );
  const data = await res.json();
  return data.exists; // Expected response: { exists: true/false }
}

// Add event listener for Generate Event Number button
document;
document
  .getElementById("generateEventNumber")
  .addEventListener("click", async () => {
    const tbaEventKey = document.getElementById("TBA_EVENT_KEY").value.trim();
    if (!tbaEventKey) {
      alert("Please enter a TBA Event Key first.");
      return;
    }
    // Display a prompt for the suffix
    const suffixInput = window.prompt("Enter new event name:", "");
    if (suffixInput === null || suffixInput.trim() === "") {
      // User cancelled or provided an empty string
      return;
    }
    const candidate = `${tbaEventKey}_${suffixInput.trim()}`;

    // Check if this candidate already exists via the API
    if (await checkEventNumber(candidate)) {
      alert(`Event number "${candidate}" already exists.`);
      return;
    }

    // Add the candidate to the dropdown if not already present
    const eventSelect = document.getElementById("EVENT_NUMBER");
    const optionExists = Array.from(eventSelect.options).some(
      (opt) => opt.value === candidate
    );
    if (!optionExists) {
      const newOption = document.createElement("option");
      newOption.value = candidate;
      newOption.textContent = candidate;
      eventSelect.appendChild(newOption);
    }
    eventSelect.value = candidate; // Automatically select the new candidate
  });

async function populateEventNumbers() {
  const databaseUrl = document.getElementById("DATABASE_URL").value;
  if (!databaseUrl) return;

  try {
    const response = await fetch("/setup/api/events", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ databaseUrl }),
    });

    const result = await response.json();

    // Check if the response contains an error
    if (result.error) {
      console.error("API Error:", result.error);
      return;
    }

    // Ensure the result is an array
    if (!Array.isArray(result)) {
      console.error("Unexpected API response format:", result);
      return;
    }

    console.log("Event Numbers:", result);

    const select = document.getElementById("EVENT_NUMBER");
    select.innerHTML = '<option value="">Select Event Number</option>';

    result.forEach((event) => {
      const option = document.createElement("option");
      option.value = event;
      option.textContent = `${event}`;
      select.appendChild(option);
    });
  } catch (error) {
    console.error("Error fetching event numbers:", error);
  }
}

document.querySelector("#submit").addEventListener("click", async () => {
  let secrets = [
    "ACCESS_CODE",
    "DATABASE_URL",
    "TBA_API_KEY",
    "GOOGLE_CLIENT_ID",

    "GOOGLE_CLIENT_SECRET",
    "FMS_API_KEY",
    "FMS_API_USERNAME",
  ];
  let config = { secrets: {} };
  for (let [key, value] of new FormData(
    document.getElementById("setup-form")
  )) {
    if (value === "") continue; //dont send unset config values (eg, no ACCESS_CODE)
    if (secrets.includes(key)) {
      config.secrets[key] = value;
    } else {
      config[key] = value;
    }
  }

  let res = await (
    await fetch("./api/config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ACCESS_CODE: oldAccessCode,
        config,
      }),
    })
  ).json();
  console.log(res, config);
  if (res.success) {
    new Modal("small")
      .header("Config Saved")
      .text("Restart the server then reload to complete setup")
      .action("Reload", () => {
        window.location.reload();
      });
  } else {
    new Modal("small").header("Config Not Saved").text(res.reason).dismiss();
  }
});
