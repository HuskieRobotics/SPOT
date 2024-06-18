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
