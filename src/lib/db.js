const mongoose = require('mongoose')
const dotenv = require('dotenv').config()

mongoose.connect(process.env.DB_URL, {useNewUrlParser: true, useUnifiedTopology: true})

const db = mongoose.connection

db.on('error', (e) => console.log(`Error: ${e}`))

db.once('open', function() {
    console.log("Connected to Database")
})

/*
example tmp
tmp = {
    "matchId": "0-0-3061-asdfghjk-b89qcn",
"matchId_rand": "b89qcn",
    "timestamp": 1642448833182,
    "clientVersion": "0.1",
    "scouterId": "asdfghjk",
    "robotNumber": 3061,
"eventNumber":0,
    "actionQueue": [
        {
            "id": "startGame",
            "ts": 150,
            "temp": true
        },
        {
            "id": "startClimb",
            "ts": 0
        },
        {
            "id": "climbF",
            "ts": 0
        }
    ]
}
*/
const teamMatchPerformanceSchema = new mongoose.Schema({
    timestamp: Number,
    clientVersion: String,
    scouterId: String,
    robotNumber: Number,
    matchNumber: Number,
    eventNumber: Number,
    matchId: String,
    matchId_rand: String,
    actionQueue: [
        {
            id: String, //button id
            ts: Number, //timestamp of action
            other: {}, //extra information like position, tied to the ACTION not the team or robot
        }
    ]     
}, {collection: "teamMatchPerformances"})

const TeamMatchPerformance = new mongoose.model("TeamMatchPerformance", teamMatchPerformanceSchema)

module.exports = {
    db,
    TeamMatchPerformance
}