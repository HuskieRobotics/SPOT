const fs = require("fs");
const { Router } = require("express");
const mongoose = require("mongoose");
const chalk = require("chalk");
const axios = require("axios");
const { config } = require("process");
let router = Router();

let REQUIRE_ACCESS_CODE;
let ACCESS_CODE;

if (fs.existsSync("config/config.json")) {
    let config = JSON.parse(fs.readFileSync("config/config.json"));
    REQUIRE_ACCESS_CODE = "ACCESS_CODE" in config;
    ACCESS_CODE = config["ACCESS_CODE"];
}


router.get("/config", async (req,res) => {
    if (!REQUIRE_ACCESS_CODE) { //config doesnt exist
        res.json({});
    } else {
        if (req.query.ACCESS_CODE == ACCESS_CODE) {
            res.sendFile("/config/config.json");
        } else {
            res.json(false);
        }
    }
})
router.post("/config", async (req,res) => {
    let config = req.body.config;
    if (!REQUIRE_ACCESS_CODE || req.body.ACCESS_CODE == ACCESS_CODE) {

        //verify mongodb url
        try {
            await mongoose.connect(config.secrets.DATABASE_URL, {useNewUrlParser: true, useUnifiedTopology: true}) //try connecting to mongodb server
        } catch (e) {
            console.log(chalk.red("invalid config.json recieved: DATABASE_URL failed to connect!"),e)
            res.json({success: false, reason:"DATABASE_URL failed to connect!"});
            return;
        }

        //verify TBA_API_KEY
        try {
            await axios.get("https://www.thebluealliance.com/api/v3/team/frc3061", { //try fetching some data from thebluealliance api
                headers: {
                    "X-TBA-Auth-Key": config.secrets.TBA_API_KEY
                }
            });
        } catch (e) {
            console.log(e)
            console.log(chalk.red("invalid config.json recieved: Invalid TBA_API_KEY!"))
            res.json({success: false, reason:"Invalid TBA_API_KEY!"});
            return;
        }

        fs.writeFileSync("config/config.json",JSON.stringify(config));

        res.json({success: true});

        //restart the app
        console.log(chalk.green("Updated config.json; restarting server..."))
        process.on("exit", () => {
            require("child_process").spawn(process.argv.shift(), process.argv, {
                cwd: process.cwd(),
                detached : true,
                stdio: "inherit"
            })
        })
        process.exit();

    } else {
        console.log(chalk.red("invalid config.json recieved: Invalid ACCESS_CODE!"))
        res.json({success: false, reason:"Invalid ACCESS_CODE!"});
    }
})

module.exports = router;