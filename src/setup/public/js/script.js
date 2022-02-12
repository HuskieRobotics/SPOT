//unregister all service workers (if they exist)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
        //returns installed service workers
        if (registrations.length) {
            for (let registration of registrations) {
                registration.unregister();
            }
        }
    });
}

document.querySelector("#submit").addEventListener("click", async () => {
    let secrets = ["ACCESS_CODE", "DATABASE_URL", "TBA_API_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]
    let config = { secrets: {} };
    for (let [key, value] of new FormData(document.getElementById("setup-form"))) {
        if (value === "") continue; //dont send unset config values (eg, no ACCESS_CODE)
        if (secrets.includes(key)) {
            config.secrets[key] = value;
        } else {
            config[key] = value;
        }
    }

    let res = await (await fetch("/api/config", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            ACCESS_CODE: "",
            config
        })
    })).json()
    console.log(res, config);
    if (res.success) {
        setTimeout(() => {
            window.location.reload();
        },5000);
    } else {
        alert(res.reason);
    }
})