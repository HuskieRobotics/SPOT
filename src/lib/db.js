const mongoose = require('mongoose')
const dotenv = require('dotenv').config()

mongoose.connect(process.env.DB_URL, {useNewUrlParser: true, useUnifiedTopology: true})

const db = mongoose.connection

db.on('error', (e) => console.log(`Error: ${e}`))

db.once('open', function() {
    console.log("Connected to Database")
})

const teamMatchPerformanceSchema = new mongoose.Schema({
    timestamp: Number,
    clientVersion: String,
    serverVersion: String,
    scouterId: String,
    teamNumber: String,
    matchNumber: String,
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