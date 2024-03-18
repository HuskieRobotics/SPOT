const { Router } = require("express");
const { TeamMatchPerformance } = require('../../lib/db');

const router = Router();
let previousTimestamp;

router.post('/teamMatchPerformance', (req, res) => {
    let teamMatchPerformance;
    try {
        teamMatchPerformance = new TeamMatchPerformance({
            timestamp: req.body.timestamp,
            clientVersion: req.body.clientVersion,
            scouterId: req.body.scouterId,
            robotNumber: req.body.robotNumber,
            matchNumber: req.body.matchNumber,
            eventNumber: req.body.eventNumber,
            matchId_rand: req.body.matchId_rand,
            actionQueue: req.body.actionQueue,
        });
    } catch (err) {
        console.log(err);
        res.status(400).end();
        return;
    }
    try {
        teamMatchPerformance.save();
    } catch (err) {
        console.log(err);
        res.status(500).end();
        return;
    }

    previousTimestamp = req.body.timestamp;

    res.status(201).end();
});

router.post('/undo', async (req, res) => {
    try {
        await TeamMatchPerformance.deleteOne({ timestamp:  previousTimestamp});
    } catch (err) {
        console.log(err);
        res.status(500).end();
        return;
    }
    res.status(200).end();
});

module.exports = router;