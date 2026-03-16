const mongoose = require("mongoose");
const chalk = require("chalk");
const config = require("./config");

mongoose
  .connect(config.secrets.DATABASE_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .catch((e) => {
    console.error(
      e,
      chalk.whiteBright.bgRed.bold(
        `\nError connecting to MongoDB! This could be because DATABASE_URL is incorrect in your environment variables. SPOT will not properly function without a database.`,
      ),
    );
  });

const db = mongoose.connection;

db.on("error", (e) => console.log(`Error: ${e}`));

db.once("open", () => {
  console.log(chalk.green("Successfully Connected to the Database"));
});

/*
example tmp
tmp = {
    "matchId": "0-0-3061-asdfghjk-b89qcn",
"matchId_rand": "b89qcn",
    "timestamp": 1642448833182,
    "clientVersion": "0.1",
    "scouterId": "asdfghjk",
    "robotNumber": 3061,
"eventNumber":0,
    "actionQueue": [
        {
            "id": "startGame",
            "ts": 150,
            "temp": true
        },
        {
            "id": "startClimb",
            "ts": 0
        },
        {
            "id": "climbF",
            "ts": 0
        }
    ]
}
*/
const teamMatchPerformanceSchema = new mongoose.Schema(
  {
    timestamp: Number,
    clientVersion: String,
    scouterId: String,
    robotNumber: Number,
    matchNumber: Number,
    eventNumber: mongoose.Schema.ObjectId,
    matchId: String,
    matchId_rand: String,
    actionQueue: [
      {
        id: String, //button id
        ts: Number, //timestamp of action
        other: {}, //extra information like position, tied to the ACTION not the team or robot
      },
    ],
  },
  { collection: "teamMatchPerformances" },
);

const TeamMatchPerformance = new mongoose.model(
  "TeamMatchPerformance",
  teamMatchPerformanceSchema,
);

const eventSchema = new mongoose.Schema(
  {
    code: String,
  },
  { collection: "events" },
);

const Event = new mongoose.model("Event", eventSchema);

module.exports = {
  db,
  TeamMatchPerformance,
  Event,
};
