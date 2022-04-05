class ScoutingSync {
    static socket;

    static SCOUTER_STATUS = {
        "NEW": 0, //scouters who have connected but have not sent their state data
        "WAITING": 1, //scouters not actively in the process of scouting (up to when they click the start button)
        "SCOUTING": 2, //scouters actively scouting a match
        "COMPLETE": 3,
        "TOOMANY": 4,
        "MATCHERROR": 5,
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
            ScoutingSync.sync();
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
            ScoutingSync.updateState(stateUpdate, true);
        })

        ScoutingSync.socket.on("syncRequest", () => {
            ScoutingSync.sync();
        })

        //store previous robot and match number for comparison
        let previousMatchInfo = {
            robotNumber: null,
            matchNumber: null
        }
        ScoutingSync.socket.on("enterMatch", () => {
            setTimeout(() => { //wait an extra 100ms to guarantee you are on the waiting screen
                console.log(ScoutingSync.state, previousMatchInfo);
                if (ScoutingSync.state.robotNumber === previousMatchInfo.robotNumber &&
                    ScoutingSync.state.matchNumber === previousMatchInfo.matchNumber)
                    return;

                previousMatchInfo = {
                    robotNumber: ScoutingSync.state.robotNumber,
                    matchNumber: ScoutingSync.state.matchNumber
                }
                if (ScoutingSync.state.matchNumber === "0") {
                    switchPage("error");
                    ScoutingSync.updateState({status: ScoutingSync.SCOUTER_STATUS.MATCHERROR}); //tell the server that you started scouting
                } else if (ScoutingSync.state.robotNumber === "") {
                    switchPage("max-scouters");
                    ScoutingSync.updateState({status: ScoutingSync.SCOUTER_STATUS.TOOMANY}); //tell the server that you started scouting
                } else {
                    switchPage("match-scouting");
                    ScoutingSync.updateState({status: ScoutingSync.SCOUTER_STATUS.SCOUTING}); //tell the server that you started scouting
                    // console.log(ScoutingSync.state.robotNumber);
                    new Modal("small").header("Match Information").text(`
                    You have been assigned team ${ScoutingSync.state.robotNumber} in match ${ScoutingSync.state.matchNumber}.
                    `).dismiss("OK")
                }
            }, 100)
        })
    }

    static updateState(stateUpdate, incoming = false) {
        return new Promise((res, rej) => {
            Object.assign(ScoutingSync.state, stateUpdate);
            if (!incoming) {
                ScoutingSync.socket.emit("updateState", ScoutingSync.state, () => {
                    res(true);
                });
            } else {
                res(true);
            }
        })
    }

    static async sync() {
        if (ScoutingSync.state.offlineMode) return false; //if in offline mode, just continue

        return new Promise(async (res, rej) => {
            let timeout = setTimeout(() => {
                new Popup("error", "Failed To Sync Data :(")
                res(false) //resolve, just so that the program can continue
            }, 10000);
            const teamMatchPerformances = await LocalData.getAllTeamMatchPerformances()
            const teamMatchPerformanceIds = teamMatchPerformances.map(teamMatchPerformance => teamMatchPerformance.matchId)
            // new Popup("notice", "Syncing Data...", 1000);
            await ScoutingSync.updateState({status: ScoutingSync.SCOUTER_STATUS.COMPLETE});
            ScoutingSync.socket.emit("syncData", teamMatchPerformanceIds, (requestedTeamMatchPerformanceIds) => {
                ScoutingSync.socket.emit("teamMatchPerformances", teamMatchPerformances.filter(teamMatchPerformance => requestedTeamMatchPerformanceIds.includes(teamMatchPerformance.matchId)), () => {
                    // new Popup("success", "Data Sync Succeeded", 1500);
                    clearTimeout(timeout);
                    res(true)
                });
            })
        })
    }
}

ScoutingSync.initialize()