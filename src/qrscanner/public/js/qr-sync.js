(async () => {
  const root = document.documentElement;
  const savedTheme = localStorage.getItem("theme");

  if (savedTheme == null || savedTheme == "light") {
    localStorage.setItem("theme", "light");
    root.setAttribute("data-theme", "light");
  } else {
    localStorage.setItem("theme", "dark");
    root.setAttribute("data-theme", "dark");
  }

  const storage = localStorage.getItem("teamMatchPerformances");
  if (storage) {
    const tmps = JSON.parse(localStorage.getItem("teamMatchPerformances")).map(
      (tmp) => JSON.parse(tmp),
    );
    console.log("Syncing TMPs with database");

    let response;
    try {
      response = await fetch("./api/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(tmps),
      });
    } catch (err) {
      response = {}.ok = false;
    }

    if (response.ok) {
      localStorage.removeItem("teamMatchPerformances");
      console.log("Successfully synced TMPs with the server");
      // TODO: Add successful data sync notificaition
    } else {
      console.log("Failed to sync TMPs with the server");
      // TODO: Add failed data sync notification
    }
  }
})();
