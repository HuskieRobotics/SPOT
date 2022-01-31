const { Router } = require("express");
const executeAnalysisPipeline = require("../analysisPipeline.js")
const fs = require("fs")

let router = Router();

router.get("/dataset", async (req, res) => {
    res.json(await executeAnalysisPipeline())
})

module.exports = router;