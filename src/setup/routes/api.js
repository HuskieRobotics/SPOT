const fs = require("fs");
const { Router } = require("express");
const mongoose = require("mongoose");
const chalk = require("chalk");
const axios = require("axios");
let router = Router();

let REQUIRE_ACCESS_CODE;
let ACCESS_CODE;
let DATABASE_URL;

if (fs.existsSync("config/config.json")) {
  let config = JSON.parse(fs.readFileSync("config/config.json"));
  REQUIRE_ACCESS_CODE = "ACCESS_CODE" in config.secrets;
  ACCESS_CODE = config.secrets["ACCESS_CODE"];
  DATABASE_URL = config.secrets["DATABASE_URL"];
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

router.get("/events", async (req, res) => {
  const { databaseURL } = req.headers["database-url"]
    ? JSON.parse(req.headers["database-url"])
    : { DATABASE_URL };
  try {
    const connection = await mongoose
      .createConnection(databaseURL, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      })
      .asPromise();
    console.log("Connected to the database");

    // fetch the event codes from the events collection into an array of just the code property
    const eventNumbers = await connection.db
      .collection("events")
      .find()
      .map((event) => event.code)
      .toArray();

    eventNumbers.sort((a, b) => b.localeCompare(a)); // Sort the event numbers
    await connection.close();
    res.json(eventNumbers);
  } catch (error) {
    console.error("Error fetching event numbers:", error);
    res.status(500).json({ error: "Failed to fetch event numbers" });
  }
});

router.post("/createEventCode", async (req, res) => {
  const { databaseURL, eventCode } = req.body;
  if (!databaseURL || !eventCode) {
    return res.status(400).json({ error: "Missing databaseURL or eventCode" });
  }
  try {
    let created = false;
    const connection = await mongoose
      .createConnection(databaseURL, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      })
      .asPromise();

    // Lookup in the teamMatchPerformances collection for the candidate event number
    const existing = await connection.db
      .collection("events")
      .findOne({ code: eventCode });

    if (!existing) {
      // create a new event code if it doesn't already exists
      await connection.db.collection("events").insertOne({ code: eventCode });
      created = true;
    }

    await connection.close();

    if (created) {
      res.status(201).end();
    } else if (existing) {
      res.status(409).json({ error: "Event code already exists" });
    } else {
      res.status(500).json({ error: "Failed to create event code" });
    }
  } catch (error) {
    console.error("Error checking event number:", error);
    res.status(500).json({ error: "Failed to check event number" });
  }
});

router.get("/config", async (req, res) => {
  if (REQUIRE_ACCESS_CODE) {
    let config = JSON.parse(fs.readFileSync("config/config.json"));

    // convert EVENT_NUMBER from ObjectId to corresponding event code string
    if (config.EVENT_NUMBER && config.secrets.DATABASE_URL) {
      try {
        const connection = await mongoose
          .createConnection(config.secrets.DATABASE_URL, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
          })
          .asPromise();
        const event = await connection.db
          .collection("events")
          .findOne({ _id: new mongoose.Types.ObjectId(config.EVENT_NUMBER) });
        if (event) {
          config.EVENT_NUMBER = event.code; // set EVENT_NUMBER to the event code string
        }
        connection.close();
      } catch (error) {
        console.error("Error fetching event number:", error);
      }
    }

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

    // convert EVENT_NUMBER to corresponding ObjectId
    if (config.EVENT_NUMBER) {
      try {
        const connection = await mongoose
          .createConnection(config.secrets.DATABASE_URL, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
          })
          .asPromise();
        const event = await connection.db
          .collection("events")
          .findOne({ code: config.EVENT_NUMBER });
        if (event) {
          config.EVENT_NUMBER = event._id; // set EVENT_NUMBER to the ObjectId of the event
        }
        await connection.close();
      } catch (error) {
        console.error("Error fetching event number:", error);
        res.json({ success: false, reason: "Failed to fetch event number" });
        return;
      }
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
