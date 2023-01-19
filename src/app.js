const express = require("express");
let app = express();
const server = app.listen(process.env.PORT || 8080, () => {console.log(chalk.cyan(`Server listening on port ${process.env.PORT || 8080}`))});
const chalk = require("chalk");
const fs = require("fs");

app.set("view engine", "ejs");
let bodyParser = require("body-parser");
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

//routes with config validation
if (fs.existsSync("config/config.json")) {
    require("./scouting/scouting-sync.js")(server);
    
    app.use("/config", require("./configRouter.js"))
    app.use("/", require("./scouting/scouting.js"));
    app.use("/analysis", require("./analysis/analysis.js"));
    app.use("/admin", require("./admin/admin.js"));
    app.use("/setup", require("./setup/setup.js"));
    app.use("/checklist", require("./checklist/checklist.js"));
} else {
    console.log(chalk.cyan.bold.underline("config.json not detected! First time setup flow enabled on server."))
    app.use("/",require("./setup/setup.js"));
}