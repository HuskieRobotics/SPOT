const express = require("express");
const fs = require("fs");
const path = require("path");

let router = express.Router();

router.use(express.static(__dirname + "/public"));

router.get("/", (req,res) => {
    res.render(__dirname + "/views/index.ejs", {
        pages: fs.readdirSync(__dirname + "/views/pages"), //include all of the pages in the pages folder
        landingPage: "landing" //the landing page of your app, the first thing a user sees when they open it
    });
})

router.get("/config.json", (req,res) => {
    res.sendFile(path.resolve(__dirname, "../../config/client.json"));
})

router.use("/api", require("./routes/api.js"));

module.exports = router;