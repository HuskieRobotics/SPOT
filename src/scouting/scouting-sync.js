/*
Socket-IO communication to synchronize many aspects of the client and server. See /scouting/public/js/scouting-sync.js for the client
*/


let io;
const {TeamMatchPerformance} = require("../lib/db.js");
const axios = require("axios");
const config = require("../../config/config.json");
const chalk = require("chalk");

module.exports = (server) => {
    if (!ScoutingSync.initialized) {
        if (!server) {
            console.warn(chalk.yellow("You need to pass in an http server to initialize ScoutingSync. This can be ignored if ScoutingSync is initialized elsewhere."))
        } else {
            ScoutingSync.initialize(server); //initialize the socketio stuff
        }
    }
    return ScoutingSync;
}

class ScoutingSync {
    static initialized = false;
    static scouters = [];
    static match;
    static SCOUTER_STATUS = {
        "NEW": 0, //scouters who have connected but have not sent their state data
        "WAITING": 1, //scouters not actively in the process of scouting (dont have the scouting ui open)
        "SCOUTING": 2, //scouters actively scouting a match
        "COMPLETE": 3,
        "TOOMANY": 4,
        "MATCHERROR": 5,
    }

    static async initialize(server) {
        if (ScoutingSync.initialized) {
            throw new Error("ScoutingSync already initialized!")
        }

        //matches
        if (!config.secrets.TBA_API_KEY) {
            console.error(chalk.whiteBright.bgRed.bold("TBA_API_KEY not found in config.json file! SPOT will not properly function without this."))
        }
        ScoutingSync.match = (await ScoutingSync.getMatches())[0] || {
            number: 0,
            match_string: "",
            robots: {red: [], blue: []}
        };

        io = require("socket.io")(server);

        //new scouter flow
        io.on("connection", (socket) => {
            let newScouter = new Scouter(socket);
            newScouter.socket.on("disconnect", () => {
                setTimeout(() => {
                    if (!newScouter.connected) { //remove old disconnnected scouters
                        ScoutingSync.scouters = ScoutingSync.scouters.filter(x => !(!x.connected && x.timestamp == newScouter.timestamp))
                    }
                }, 60000)
            })
            ScoutingSync.scouters.push(newScouter);
        })

        console.log(chalk.green("Successfully Initialized ScoutingSync"))
        ScoutingSync.initialized = true;
    }

    /**
     * get a regional's matches from thebluealliance api
     */
    static async getMatches() {
        if (!config.secrets.TBA_API_KEY) {
            return []; //no key, no matches
        }
        let tbaMatches = (await axios.get(`https://www.thebluealliance.com/api/v3/event/${config.TBA_EVENT_KEY}/matches`, {
            headers: {
                "X-TBA-Auth-Key": config.secrets.TBA_API_KEY
            }
        }).catch(e => console.log(e, chalk.bold.red("\nError fetching matches from Blue Alliance Api!")))).data;

        //determine match numbers linearly (eg. if there are 10 quals, qf1 would be match 11)
        const matchLevels = ["qm", "ef", "qf", "sf", "f"];
        let levelCounts = {};
        for (let level of matchLevels) {
            levelCounts[level] = tbaMatches.filter(x => x.comp_level == level).length
        }

        //find the offset to apply to each level of match
        let levelOffsets = {};
        for (let [index, level] of matchLevels.entries()) {
            levelOffsets[level] = matchLevels.slice(0, index).reduce((acc, level) => acc + levelCounts[level], 0);
        }

        let processedMatches = [];

        //add the level offset to each match and simplify structure
        for (let match of tbaMatches) {
            processedMatches.push({
                number: match.match_number + levelOffsets[match.comp_level], //adjust match number with the offset
                match_string: match.key,
                robots: {
                    red: match.alliances.red.team_keys.map(x => x.replace("frc", "")),
                    blue: match.alliances.blue.team_keys.map(x => x.replace("frc", ""))
                }
            });
        }

        //sort the processed matches by number
        processedMatches = processedMatches.sort((a, b) => a.number - b.number);

        return processedMatches;
    }

    /**
     * assign all current scouters to a robot
     */
    static assignScouters() {
        let nextRobots = new Set(ScoutingSync.match.robots.red.concat(ScoutingSync.match.robots.blue)); //the robots that are next in line to be assigned to scouters


        //if someone is ACTIVELY scouting the robot, remove it from the set of robots to be scouted
        for (let scouter of ScoutingSync.scouters) {
            if (scouter.state.connected && scouter.state.status === ScoutingSync.SCOUTER_STATUS.SCOUTING) {
                nextRobots.delete(scouter.state.robotNumber);
            }
        }

        //assign the rest of the robots to waiting scouters
        for (let scouter of ScoutingSync.scouters) {
            if (scouter.state.connected && scouter.state.status === ScoutingSync.SCOUTER_STATUS.WAITING) {
                //check to see if nextRobots is empty, if so repopulate it with all the robots in the match
                if (nextRobots.size === 0) new Set(ScoutingSync.match.robots.red.concat(ScoutingSync.match.robots.blue));

                //get the next robot number from the set (the set doesnt return robots in any particular order)
                let robotNumber = [...nextRobots][0]
                nextRobots.delete(robotNumber);

                //notify the scouter of their match assignment
                scouter.updateState({
                    matchNumber: ScoutingSync.match.number,
                    robotNumber,
                })
            }
        }

        let currentMatchWaitingScouters = ScoutingSync.scouters.filter(x =>
            x.state.matchNumber == ScoutingSync.match.number &&
            x.state.status == ScoutingSync.SCOUTER_STATUS.WAITING &&
            x.state.connected);

        //if anyone is scouting the match, tell all waiting scouters to start
        if (ScoutingSync.scouters.filter(x =>
            x.state.matchNumber == ScoutingSync.match.number &&
            x.state.status == ScoutingSync.SCOUTER_STATUS.SCOUTING
        ).length > 0) {
            for (let scouter of currentMatchWaitingScouters) {
                scouter.socket.emit("enterMatch");
            }
        } else if (currentMatchWaitingScouters.length >= 6) { //if there are 6 scouters waiting, enter match.
            for (let scouter of currentMatchWaitingScouters) {
                scouter.socket.emit("enterMatch");
            }
        }
    }

    static getScouters() {
        let out = ScoutingSync.scouters.map(x => {
            return {...x}
        });
        for (let scouter of out) { //remove sockets from all the scouters so there isn't circular dependency
            delete scouter.socket;
        }
        return out;
    }

    static setMatch(match) {
        ScoutingSync.match = match;
    }
}

class Scouter {
    state = {
        status: ScoutingSync.SCOUTER_STATUS.NEW,
        connected: true, //connected by default
        offlineMode: false, //they are connected to the server, they can't be offline
    };
    socket;
    timestamp;

    constructor(socket) {
        this.socket = socket;
        this.timestamp = Date.now();

        //socket listeners below

        this.socket.on("disconnect", () => {
            this.updateState({connected: false}); //the scouter should probably get killed here
            ScoutingSync.assignScouters(); //reassign scouters, this matters if there are two scouters on one robot and a scouter scouting 1 robot leaves
        })

        this.socket.on("updateState", (stateUpdate, ack) => {
            this.state = Object.assign(this.state, stateUpdate);
            ScoutingSync.assignScouters(); //reassign scouters, just to be sure it's all correct
            if (ack) ack(); //acknowledge the status update
        })

        this.socket.on("teamMatchPerformances", (teamMatchPerformances, ack) => {
            TeamMatchPerformance.create(teamMatchPerformances);
            if (ack) ack(true);
        })

        this.socket.on("syncData", async (clientTeamMatchPerformanceIds, requestTeamMatchPerformances) => {
            const serverTeamMatchPerformanceIds = (await TeamMatchPerformance.find()).map(teamMatchPerformance => teamMatchPerformance.matchId)
            requestTeamMatchPerformances(clientTeamMatchPerformanceIds.filter(clientTeamMatchPerformanceId => !serverTeamMatchPerformanceIds.includes(clientTeamMatchPerformanceId)))
        })

        this.socket.on("clearData", async () => {
            await TeamMatchPerformance.deleteMany()
            console.log("all data cleared")
        })
    }

    updateState(stateUpdate) {
        this.state = Object.assign(this.state, stateUpdate);
        this.socket.emit("updateState", stateUpdate);
    }

    sync() {
        this.socket.emit("syncRequest")
    }
}