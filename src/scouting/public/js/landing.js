const landingSpinner = document.querySelector("#landing .spinner-container")
const landingClientId = "800684505201-pfg5ddut06emg4l4ch4b8u0jco05vluh.apps.googleusercontent.com"
let auth2
let currentUser

gapi.load('auth2', () => {
    auth2 = gapi.auth2.init({
        client_id: landingClientId
    })


    auth2.then(() => {
        if (!auth2.isSignedIn.get()) {
            //auth2.attachClickHandler(document.querySelector(".auth-buttons .google"), {})
            landingSpinner.classList.remove("visible")
        }
    }).catch(() => {
        //document.querySelector(".auth-buttons .google").classList.remove("active")
        landingSpinner.classList.remove("visible")
    })

	setTimeout(() => {
		// document.querySelector(".auth-buttons .google").classList.remove("active")
        landingSpinner.classList.remove("visible")
	}, 5000)

    

    auth2.isSignedIn.listen(signinChanged)
    auth2.currentUser.listen(userChanged)
})

function signinChanged(val) {
    if (!val) {
        signOut()
    }
}

async function signOut() {
    await auth2.signOut()
    switchPage("landing")
    landingSpinner.classList.remove("visible")
}

async function userChanged(user) {
    if (auth2.isSignedIn.get()) {
        const verification = await verify(user)
        console.log(verification)
        if (verification.status) {
            currentUser = verification.user
            //TODO: update ScoutingSync.scouterId
            switchPage("waiting")
            landingSpinner.classList.remove("visible")
        }
    }
}

async function verify(user) {
    const res = await fetch("/auth/verify", {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            token: user.getAuthResponse().id_token
        }
    }).then(res => res.json())
    return res
}

document.querySelector("#landing > div.auth.landing-screen > div > div.manual").addEventListener("click", () => {
    updateForm();
    switchPage("form");
});
document.querySelector("#landing > div.auth.landing-screen > div > div.admin").addEventListener("click", () => {
    location.href = '/admin/';
});
document.querySelector("#landing > div.auth.landing-screen > div > div.analysis").addEventListener("click", () => {
    location.href = '/analysis/';
});
document.querySelector("#landing > div.auth.landing-screen > div > div.info").addEventListener("click", () => {
    setPage("landing")
    switchPage("instructions")
});

// signOutBtn.addEventListener("click", signOut)