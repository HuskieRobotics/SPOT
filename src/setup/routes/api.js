const fs = require("fs");
const { Router } = require("express");
const mongoose = require("mongoose");
const chalk = require("chalk");
const axios = require("axios");
let router = Router();

let REQUIRE_ACCESS_CODE;
let ACCESS_CODE;

if (fs.existsSync("config/config.json")) {
    let config = JSON.parse(fs.readFileSync("config/config.json"));
    REQUIRE_ACCESS_CODE = "ACCESS_CODE" in config;
    ACCESS_CODE = config["ACCESS_CODE"];
}

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
        console.log(chalk.green("Updated config.json; stopping server..."))

        process.exit();
    } else {
        console.log(chalk.red("invalid config.json recieved: Invalid ACCESS_CODE!"))
        res.json({success: false, reason:"Invalid ACCESS_CODE!"});
    }
})


module.exports = router;