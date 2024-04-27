const { Router } = require("express");
const { TeamMatchPerformance } = require('../../lib/db');

const router = Router();
let previousMatchIDRand;

router.post('/teamMatchPerformance', async (req, res) => {
    try {
        const duplicate = await TeamMatchPerformance.findOne({ matchId_rand: req.body.matchId_rand });

        console.log(duplicate);

        if (duplicate) {
            res.status(204).end();
            return;
        }
    } catch (err) {
        console.log(err);
        res.status(400).end();
        return;
    }

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
        await teamMatchPerformance.save();
    } catch (err) {
        console.log(err);
        res.status(500).end();
        return;
    }

    previousMatchIDRand = req.body.matchId_rand;

    res.status(201).end();
});

router.post('/undo', async (req, res) => {
    try {
        await TeamMatchPerformance.deleteOne({ matchId_rand:  previousMatchIDRand});
    } catch (err) {
        console.log(err);
        res.status(500).end();
        return;
    }
    res.status(200).end();
});

module.exports = router;