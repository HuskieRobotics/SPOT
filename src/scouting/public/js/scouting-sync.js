class ScoutingSync {
  static socket;
  static matches;

  static SCOUTER_STATUS = {
    NEW: 0, //scouters who have connected but have not sent their state data
    WAITING: 1, //scouters not actively in the process of scouting (up to when they click the start button)
    SCOUTING: 2, //scouters actively scouting a match
    COMPLETE: 3,
    DISCONNECTED_BY_ADMIN: 4,
  };

  static state = {
    connected: false,

    offlineMode: true, //offline mode is for users who never connect to the server and access the app without internet.
    status: ScoutingSync.SCOUTER_STATUS.NEW,
    scouterId: "",
    robotNumber: "",
    matchNumber: 0,
  };

  static async initialize() {
    ScoutingSync.socket = io();

    ScoutingSync.matches = (
      await fetch("/admin/api/matches").then((res) => res.json())
    ).allMatches;
    function onConnect() {
      if (ScoutingSync.state.connected) return; //only run connect events once
      ScoutingSync.state.offlineMode = false; //the user connected so disable offlineMode
      ScoutingSync.state.connected = true;
      ScoutingSync.socket.emit("updateState", ScoutingSync.state); //send the server your initial state
      ScoutingSync.socket.emit("updateScouterID", ScoutingSync.scouterId); //send the server your scouter id
      document.querySelector(".status .socket-status").innerText = "Connected";
      document
        .querySelector(".status .socket-status")
        .classList.add("connected");
      document
        .querySelector(".status .socket-status")
        .classList.remove("disconnected");
      ScoutingSync.sync();
    }
    ScoutingSync.socket.on("connect", onConnect);

    setTimeout(() => {
      if (ScoutingSync.socket.connected) {
        onConnect(); //sometimes socketio doesnt fire "connect" event on page reload. why? who knows.
      } else {
        new Popup("error", "failed to connect!");
      }
    }, 1000);

    ScoutingSync.socket.on(
      "connect_error",
      (err) => new Popup("error", err.toString())
    );

    ScoutingSync.socket.on("disconnect", () => {
      ScoutingSync.state.connected = false;
      document.querySelector(".status .socket-status").innerText =
        "Disconnected";
      document
        .querySelector(".status .socket-status")
        .classList.remove("connected");
      document
        .querySelector(".status .socket-status")
        .classList.add("disconnected");

      console.log("disconnected");
    });

    ScoutingSync.socket.on("err", (msg) => {
      // new Popup("error", msg);
    });

    ScoutingSync.socket.on("updateState", (stateUpdate) => {
      console.log("State Update:", stateUpdate);
      ScoutingSync.updateState(stateUpdate, true);
    });

    ScoutingSync.socket.on("syncRequest", () => {
      ScoutingSync.sync();
    });

    ScoutingSync.socket.on("adminDisconnect", () => {
      console.log("adminDisconnectStarted");
      switchPage("landing");
      ScoutingSync.state.status =
        ScoutingSync.SCOUTER_STATUS.DISCONNECTED_BY_ADMIN;
      console.log("adminDisconnectComplete");
    });

    //store previous robot and match number for comparison
    let previousMatchInfo = {
      robotNumber: null,
      matchNumber: null,
    };
    ScoutingSync.socket.on("enterMatch", () => {
      console.log("enterMatch");
      setTimeout(() => {
        //wait an extra 100ms to guarantee you are on the waiting screen
        if (
          (ScoutingSync.state.robotNumber == previousMatchInfo.robotNumber &&
            ScoutingSync.state.matchNumber == previousMatchInfo.matchNumber) ||
          ScoutingSync.state.status === ScoutingSync.SCOUTER_STATUS.NEW
        )
          return;

        previousMatchInfo = {
          robotNumber: ScoutingSync.state.robotNumber,
          matchNumber: ScoutingSync.state.matchNumber,
        };

        switchPage("match-scouting");
        document.querySelector(".scouting-info").style.display = "block";
        new Modal("small")
          .header("Match Information")
          .text(
            `
                You have been assigned team ${ScoutingSync.state.robotNumber} in match ${ScoutingSync.state.matchNumber}.
                `
          )
          .dismiss("OK");
      }, 100);
    });
  }
  static updateState(stateUpdate, incoming = false) {
    return new Promise((res, rej) => {
      Object.assign(ScoutingSync.state, stateUpdate);
      const updateMatch = ScoutingSync.matches.find(
        (m) => m.number == ScoutingSync.state.matchNumber
      );
      if (updateMatch) {
        document.querySelector(
          ".scouting-info"
        ).innerText = `Match: ${ScoutingSync.state.matchNumber} | Team: ${ScoutingSync.state.robotNumber}`;
        document.querySelector(".scouting-info").style.color =
          updateMatch.robots.red.includes(ScoutingSync.state.robotNumber)
            ? "var(--error)"
            : "var(--accent)";
      }

      if (!incoming) {
        ScoutingSync.socket.emit("updateState", ScoutingSync.state, () => {
          res(true);
        });
      } else {
        res(true);
      }
    });
  }

  static async sync() {
    if (ScoutingSync.state.offlineMode) return false; //if in offline mode, just continue

    return new Promise(async (res, rej) => {
      let timeout = setTimeout(() => {
        new Popup("error", "failed to sync data!");
        res(false); //resolve, just so that the program can continue
      }, 5000);
      const teamMatchPerformances =
        await LocalData.getAllTeamMatchPerformances();
      const teamMatchPerformanceIds = teamMatchPerformances.map(
        (teamMatchPerformance) => teamMatchPerformance.matchId
      );
      new Popup("notice", "Syncing Data...", 5000);
      ScoutingSync.socket.emit(
        "syncData",
        teamMatchPerformanceIds,
        (requestedTeamMatchPerformanceIds) => {
          ScoutingSync.socket.emit(
            "teamMatchPerformances",
            teamMatchPerformances.filter((teamMatchPerformance) =>
              requestedTeamMatchPerformanceIds.includes(
                teamMatchPerformance.matchId
              )
            ),
            () => {
              new Popup("success", "Data Sync Complete!", 2000);
              clearTimeout(timeout);
              LocalData.clearTeamMatchPerformances();
              res(true);
            }
          );
        }
      );
    });
  }
}

try {
  ScoutingSync.initialize();
} catch (e) {
  console.log("Socket failed to load", e);
}
