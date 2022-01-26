const { Router } = require("express");
const executeAnalysisPipeline = require("../analysisPipeline.js")


let router = Router();

router.get("/dataset", async (req, res) => {
    res.json(await executeAnalysisPipeline())
})

module.exports = router;