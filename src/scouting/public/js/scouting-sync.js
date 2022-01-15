class ScoutingSync {
    static socket;

    static SCOUTER_STATUS = {
        "WAITING": 0, //scouters not actively in the process of scouting (up to when they click the start button)
        "SCOUTING": 1, //scouters actively scouting a match
        "NEW": 2, //scouters who have connected but have not sent their state data
    }

    static state = {
        connected: false, 
        offlineMode: true, //offline mode is for users who never connect to the server and access the app without internet.
        status: this.SCOUTER_STATUS.WAITING,
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

        ScoutingSync.socket.on("reconnect", () => {

        })

        ScoutingSync.socket.on("err", (msg) => {
            console.error(msg)
        })

        ScoutingSync.socket.on("updateState", (stateUpdate) => {
            console.log("State Update:", stateUpdate)
            ScoutingSync.updateState(stateUpdate)  
        })

        ScoutingSync.socket.on("syncRequest", () => {
            ScoutingSync.sync()
        })
    }

    static updateState(stateUpdate) {
        Object.assign(ScoutingSync.state, stateUpdate)
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