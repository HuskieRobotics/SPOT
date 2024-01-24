const express = require('express');

let route = express.Router();

route.use(express.static(__dirname + "/public"));

route.get("/", (req, res) => {
    res.render(__dirname + "/views/index.ejs");
});

route.use("/api", require("./routes/api.js"));

module.exports = route;