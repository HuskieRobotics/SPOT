// let currentUser
// gapi.load('auth2', async () => {
//     await gapi.auth2.init({
//         client_id: ''
//     })
//     if (!gapi.getAuthInstance().isSignedIn.get()) {
//       //if not signed in
//     }

//     gapi.signin2.render('login-btn', {
//         'scope': 'profile email',
//         'width': 240,
//         'height': 50,
//         'longtitle': true,
//         'theme': 'dark'
//     })

//     auth2.attachClickHandler('login-btn', {})

//     auth2.isSignedIn.listen(signinChanged)
//     auth2.currentUser.listen(userChanged)
// })

// function signinChanged(val) {
//     if (!val) {
//             signOut()
//     }
// }

// async function signOut() {
//     loadAround(async () => {
//             await auth2.signOut()
//     })
// }

// async function userChanged(user) {
//   if (auth2.isSignedIn.get() && state.mode == 0) {
//     await loadAround(async () => {
//       const verification = await verify(user)
//       if (verification.status) {
        
//       }
//     })
//   }
// }

// async function verify(user) {
//   const res = await fetch("/login", {
//     method: "GET",
//     headers: {
//       "Content-Type": "application/json",
//       token: user.getAuthResponse().id_token
//     }
//   }).then(res => res.json())
//   return res
// }

// signOutBtn.addEventListener("click", signOut)