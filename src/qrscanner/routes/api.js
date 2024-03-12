const { Router } = require("express");

let router = Router();

router.post('/teamMatchPerformance', (req, res) => {
    console.log(req.body);
});

module.exports = router;