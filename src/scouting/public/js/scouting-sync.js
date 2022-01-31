class ScoutingSync {
    static socket;

    static SCOUTER_STATUS = {
        "NEW": 0, //scouters who have connected but have not sent their state data
        "WAITING": 1, //scouters not actively in the process of scouting (up to when they click the start button)
        "SCOUTING": 2, //scouters actively scouting a match
        "COMPLETE": 3,
    }

    static state = {
        connected: false, 
        offlineMode: true, //offline mode is for users who never connect to the server and access the app without internet.
        status: ScoutingSync.SCOUTER_STATUS.NEW,
        scouterId: "",
        robotNumber: "",
        matchNumber: 0
    }

    static initialize() {
        ScoutingSync.socket = io()

        ScoutingSync.socket.on("connect", () => {
            ScoutingSync.state.offlineMode = false; //the user connected so disable offlineMode
            ScoutingSync.state.connected = true;
            ScoutingSync.socket.emit("updateState", ScoutingSync.state) //send the server your initial state
            console.log("connected");
        })

        ScoutingSync.socket.on("disconnect", () => {
            ScoutingSync.state.connected = false;
            console.log("disconnected");
        })

        ScoutingSync.socket.on("err", (msg) => {
            console.error(msg);
        })

        ScoutingSync.socket.on("updateState", (stateUpdate) => {
            console.log("State Update:", stateUpdate);
            ScoutingSync.updateState(stateUpdate,true);
        })

        ScoutingSync.socket.on("syncRequest", () => {
            ScoutingSync.sync();
        })

        ScoutingSync.socket.on("enterMatch", () => {
            switchPage("match-scouting");
        })
    }
    static updateState(stateUpdate,incoming=false) {
        Object.assign(ScoutingSync.state, stateUpdate);
        if (!incoming) {
            ScoutingSync.socket.emit("updateState", ScoutingSync.state);
        }
    }

    static async sync() {
        const teamMatchPerformances = await LocalData.getAllTeamMatchPerformances()
        const teamMatchPerformanceIds = teamMatchPerformances.map(teamMatchPerformance => teamMatchPerformance.matchId)

        ScoutingSync.socket.emit("syncData", teamMatchPerformanceIds, (requestedTeamMatchPerformanceIds) => {
            ScoutingSync.socket.emit("teamMatchPerformances", teamMatchPerformances.filter(teamMatchPerformance => requestedTeamMatchPerformanceIds.includes(teamMatchPerformance.matchId)))
        })
    }
}

ScoutingSync.initialize()