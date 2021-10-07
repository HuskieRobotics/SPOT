const express = require("express")
const db = require("./lib/db.js");

let app = express();

app.set("view engine", "ejs");
let bodyParser = require("body-parser");
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));


let session = require('express-session');
app.use(session({secret: process.env.SESSION_SECRET}));

//routes
app.use("/", require("./scouting/scouting.js"));
app.use("/analysis", require("./analysis/analysis.js"));


app.listen(process.env.PORT || 8080, () => {console.log("Listening on port 8080")});