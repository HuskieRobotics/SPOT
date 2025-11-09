const spinner = document.querySelector("#landing .spinner-container");

const clientId =
  "800684505201-pfg5ddut06emg4l4ch4b8u0jco05vluh.apps.googleusercontent.com";
let auth2;
let currentUser;

gapi.load("auth2", () => {
  auth2 = gapi.auth2.init({
    client_id: clientId,
  });

  auth2
    .then(() => {
      if (!auth2.isSignedIn.get()) {
        auth2.attachClickHandler(
          document.querySelector(".auth-buttons .google"),
          {}
        );
        spinner.classList.remove("visible");
      }
    })
    .catch(() => {
      document
        .querySelector(".auth-buttons .google")
        .classList.remove("active");
      spinner.classList.remove("visible");
    });

  setTimeout(() => {
    document.querySelector(".auth-buttons .google").classList.remove("active");
    spinner.classList.remove("visible");
  }, 5000);

  auth2.isSignedIn.listen(signinChanged);
  auth2.currentUser.listen(userChanged);
});

function signinChanged(val) {
  if (!val) {
    signOut();
  }
}

async function signOut() {
  await auth2.signOut();
  switchPage("landing");
  spinner.classList.remove("visible");
}

/**
 * The function of the isDemo method is so that whenever SPOT is in demo mode,
 *  it updates some text so that SPOT makes it very clear that it is in demo mode.
 */
async function isDemo() {
  const isDemo = await fetch("./auth/isDemo").then((res) => res.json()); // Check if in demo mode

  demoLabel = document.querySelector(".demo-label");

  if (isDemo == true) {
    // Basically makes the demo text appear.
    demoLabel.textContent = "DEMO";
    demoLabel.style.fontSize = "3em";
    demoLabel.style.lineHeight = "1em";
    demoLabel.style.marginBottom = "12px";
  } else {
    // Basically makes the demo text disappear.
    demoLabel.textContent = "";
    demoLabel.style.fontSize = "0em";
    demoLabel.style.lineHeight = "0em";
    demoLabel.style.marginBottom = "0px";
  }
}
isDemo(); // Probably somewhere better to put this, but it works so I do not care to find it.

async function userChanged(user) {
  if (auth2.isSignedIn.get()) {
    const verification = await verify(user);
    console.log(verification);
    if (verification.status) {
      currentUser = verification.user;
      //TODO: update ScoutingSync.scouterId
      switchPage("waiting");
      spinner.classList.remove("visible");
    }
  }
}

async function verify(user) {
  const res = await fetch("/auth/verify", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      token: user.getAuthResponse().id_token,
    },
  }).then((res) => res.json());
  return res;
}

document
  .querySelector("#landing > div.auth.landing-screen > div > div.manual")
  .addEventListener("click", () => {
    updateForm();
    switchPage("form");
  });

// signOutBtn.addEventListener("click", signOut)
