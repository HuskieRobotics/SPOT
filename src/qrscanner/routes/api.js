const { Router } = require("express");
const { TeamMatchPerformance } = require('../../lib/db');

let router = Router();

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
        res.status(500).end();
    }
    try {
        teamMatchPerformance.save();
    } catch (err) {
        console.log(err);
    }

    res.status(201).end();
});

module.exports = router;