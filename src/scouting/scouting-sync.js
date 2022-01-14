/*
Socket-IO communication to synchronize many aspects of the client and server. See /scouting/public/js/scouting-sync.js for the client
*/



let io;
const {TeamMatchPerformance} = require("../lib/db.js")

module.exports = (server) => {
    if (!ScoutingSync.initialized) {
        if (!server) {
            console.warn("You need to pass in an http server to initialize ScoutingSync!")
        } else {
            ScoutingSync.initialize(server); //initialize the socketio stuff
        }
    }
    return ScoutingSync;
}

class ScoutingSync {
    static initialized = false;
    static scouters = [];
    static match = {
        number: 0,
        robots: {
            red: ["3061","111","254"],
            blue: ["3062","112","255"],
        }
    }
    static SCOUTER_STATUS = {
        "WAITING": 0, //scouters not actively in the process of scouting (dont have the scouting ui open)
        "SCOUTING": 1, //scouters actively scouting a match
        "NEW": 2, //scouters who have connected but have not sent their state data
    }

    static initialize(server) {
        if (ScoutingSync.initialized) {
            throw new Error("ScoutingSync already initialized!")
        }
        io = require("socket.io")(server);
    
        io.on("connection", (socket) => {
            ScoutingSync.scouters.push(new Scouter(socket));
        })
        
        setInterval(() => ScoutingSync.assignScouters(), 5000); //assign scouters every 5 seconds
    }
    static assignScouters() {
        let nextRobots = new Set(ScoutingSync.match.robots.red.concat(ScoutingSync.match.robots.blue)); //the robots that are next in line to be assigned to scouters
        
        for (let scouter of ScoutingSync.scouters) {
            if (scouter.state.connected && scouter.state.status === ScoutingSync.SCOUTER_STATUS.SCOUTING) { 
                nextRobots.delete(scouter.status.robotNumber); //if someone is scouting the robot, remove it from the set of robots to be scouted
            }
        }

        for (let scouter of ScoutingSync.scouters) {
            if (scouter.state.connected && scouter.state.status === ScoutingSync.SCOUTER_STATUS.WAITING) {
                //check to see if nextRobots is empty, if so repopulate it with all the robots in the match
                if (nextRobots.size === 0) new Set(ScoutingSync.match.robots.red.concat(ScoutingSync.match.robots.blue));

                //get the next robot number from the set (the set doesnt return robots in any particular order)
                let robotNumber = [...nextRobots][0]
                nextRobots.delete(robotNumber);
                
                //notify the scouter of their match assignment
                scouter.updateState({
                    state: ScoutingSync.SCOUTER_STATUS.SCOUTING,
                    matchNumber: ScoutingSync.match.number,
                    robotNumber,
                })
            }
        }

    }
}

class Scouter {
    state = {
        status: ScoutingSync.SCOUTER_STATUS.NEW,
        connected: true, //connected by default
        offlineMode: false, //they are connected to the server, they can't be offline
    };
    socket;

    constructor(socket) {
        this.socket = socket;
        
        //socket listeners below

        this.socket.on("disconnect", () => {
            this.updateState({connected: false}); //the scouter should probably get killed here
        })

        this.socket.on("updateState", (stateUpdate) => {
            this.state = Object.assign(this.state, stateUpdate);
        })

        this.socket.on("matchTeamPerformance", (matchTeamPerformance) => {
            TeamMatchPerformance.create(matchTeamPerformance);
        })
    }

    updateState(stateUpdate) {
        this.state = Object.assign(this.state, stateUpdate);
        this.socket.emit("updateState", stateUpdate);
    }
}