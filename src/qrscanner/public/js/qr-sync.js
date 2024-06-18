(async () => {
  const storage = localStorage.getItem("teamMatchPerformances");
  if (storage) {
    const tmps = JSON.parse(localStorage.getItem("teamMatchPerformances")).map(
      (tmp) => JSON.parse(tmp)
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
