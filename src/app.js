const express = require("express")
const db = require("./lib/db.js");

let app = express();

app.set("view engine", "ejs");
let bodyParser = require("body-parser");
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());

//routes
// app.use("/", require("./scouting/scouting.js"));
// app.use("/analysis", require("./analysis/analysis.js"));


app.listen(8080, () => {console.log("Listening on port 8080")});