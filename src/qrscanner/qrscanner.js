const express = require('express');
const { TeamMatchPerformance } = require('../lib/db.js');

let route = express.Router();

route.use(express.static(__dirname + "/public"));

route.get("/", (req, res) => {
    res.render(__dirname + "/views/index.ejs");
});

route.get("/temp", (req, res) => {
    res.render(__dirname + "/views/temp.ejs");
});

route.post('/teamMatchPerformance', (req, res) => {
    console.log(req.body);
});

route.use("/api", require('./routes/api.js'));

module.exports = route;