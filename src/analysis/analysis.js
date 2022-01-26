const express = require("express");
const path = require("path")

let router = express.Router();

router.use(express.static(__dirname + "/public"));

router.get("/", (req,res) => {
    res.render(__dirname + "/views/index.ejs");
})

router.get("/analysis-modules.json", (req,res) => {
    res.sendFile(path.resolve(__dirname, "../../config/analysis-modules.json"));
})

router.use("/api", require("./routes/api.js"));

module.exports = router;