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
  REQUIRE_ACCESS_CODE = "ACCESS_CODE" in config.secrets;
  ACCESS_CODE = config.secrets["ACCESS_CODE"];
}

router.get("/auth", (req, res) => {
  if (REQUIRE_ACCESS_CODE) {
    let config = JSON.parse(fs.readFileSync("config/config.json"));

    if (config.secrets.ACCESS_CODE === "") {
      res.json({ status: 2 });
    } else if (config.secrets.ACCESS_CODE == req.headers.authorization) {
      res.json({ status: 1 });
    } else {
      res.json({ status: 0 });
    }
  } else {
    res.json({ status: 2 });
  }
});

router.get("/config", (req, res) => {
  if (REQUIRE_ACCESS_CODE) {
    let config = JSON.parse(fs.readFileSync("config/config.json"));

    if (
      config.secrets.ACCESS_CODE === "" ||
      req.headers.authorization === config.secrets.ACCESS_CODE
    ) {
      res.json({ config: config });
    } else {
      res.json({ error: "Not Authorized" });
    }
  } else {
    res.send({});
  }
});

router.post("/config", async (req, res) => {
  let config = req.body.config;
  if (!REQUIRE_ACCESS_CODE || req.body.ACCESS_CODE == ACCESS_CODE) {
    //verify mongodb url
    try {
      await mongoose.connect(config.secrets.DATABASE_URL, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }); //try connecting to mongodb server
    } catch (e) {
      console.log(
        chalk.red(
          "invalid config.json recieved: DATABASE_URL failed to connect!"
        ),
        e
      );
      res.json({ success: false, reason: "DATABASE_URL failed to connect!" });
      return;
    }

    //verify TBA_API_KEY
    try {
      await axios.get("https://www.thebluealliance.com/api/v3/team/frc3061", {
        //try fetching some data from thebluealliance api
        headers: {
          "X-TBA-Auth-Key": config.secrets.TBA_API_KEY,
        },
      });
    } catch (e) {
      console.log(e);
      console.log(
        chalk.red("invalid config.json recieved: Invalid TBA_API_KEY!")
      );
      res.json({ success: false, reason: "Invalid TBA_API_KEY!" });
      return;
    }
    if (!("DEMO" in config)) {
      config.DEMO = false;
    }
    fs.writeFileSync("config/config.json", JSON.stringify(config));

    res.json({ success: true });

    //restart the app
    console.log(chalk.green("Updated config.json; stopping server..."));

    process.exit();
  } else {
    console.log(
      chalk.red("invalid config.json recieved: Invalid ACCESS_CODE!")
    );
    res.json({ success: false, reason: "Invalid ACCESS_CODE!" });
  }
});

module.exports = router;
