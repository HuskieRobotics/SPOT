const { Router } = require("express");
const { TeamMatchPerformance } = require('../../lib/db');

let router = Router();

router.post('/teamMatchPerformance', (req, res) => {
    console.log(req.body);
    console.log(TeamMatchPerformance);

    // const teamMatchPerformance 

    res.status(201).end();
});

module.exports = router;