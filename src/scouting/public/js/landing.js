const clientId = "800684505201-pfg5ddut06emg4l4ch4b8u0jco05vluh.apps.googleusercontent.com"

let auth2
let currentUser
gapi.load('auth2', () => {
  auth2 = gapi.auth2.init({
    client_id: clientId
  })

  auth2.then(() => {
    if (!auth2.isSignedIn.get()) {
    //   showFade(loginContainer)
    //   endLoad()
    }
  })

  auth2.attachClickHandler(document.querySelector(".auth-buttons .google"), {})

  auth2.isSignedIn.listen(signinChanged)
  auth2.currentUser.listen(userChanged)
})

function signinChanged(val) {
  if (!val) {
    signOut()
  }
}

async function signOut() {
  loadAround(async () => {
    await auth2.signOut()
    // hideFade(app)
    // showFade(loginContainer)
    // setState(0)
    // setTimeout(() => {
    //   resetApp()
    // }, 300)
  })
}

async function userChanged(user) {
  if (auth2.isSignedIn.get() && state.mode == 0) {
    await loadAround(async () => {
      const verification = await verify(user)
      if (verification.status) {
        currentUser = verification.user
        // hideFade(loginContainer)
        // showFade(app)
      }
    })
  }
}

async function verify(user) {
  const res = await fetch("/login", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      token: user.getAuthResponse().id_token
    }
  }).then(res => res.json())
  return res
}

// signOutBtn.addEventListener("click", signOut)