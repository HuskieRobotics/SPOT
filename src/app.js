const express = require("express");
let app = express();
const server = app.listen(process.env.PORT || 8080, () => {
  console.log(
    chalk.cyan(`Server listening on port ${process.env.PORT || 8080}`)
  );
});
const chalk = require("chalk");
const fs = require("fs");

const axios = require("axios");
axios.defaults.baseURL = `http://localhost:${process.env.PORT || 8080}`;

app.set("view engine", "ejs");
let bodyParser = require("body-parser");
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes with config validation
if (fs.existsSync("config/config.json")) {
  const config = require("../config/config.json");
  isConfigV4 = config.EVENT_NUMBER && Number(config.EVENT_NUMBER);
  if (isConfigV4) {
    console.log("Old config detected, removing EVENT_NUMBER");
    delete config.EVENT_NUMBER;
    fs.writeFileSync("config/config.json", JSON.stringify(config));
  }

  require("./scouting/scouting-sync.js")(server);

  app.use("/config", require("./configRouter.js"));
  app.use("/", require("./scouting/scouting.js"));
  app.use("/analysis", require("./analysis/analysis.js")); // Mount the analysis routes
  app.use("/admin", require("./admin/admin.js"));
  app.use("/qrscanner", require("./qrscanner/qrscanner.js"));
  app.use("/edit", require("./edit/edit.js"));
  app.use("/setup", require("./setup/setup.js"));
  app.use("/schedule", require("./schedule/schedule").router);
} else {
  console.log(
    chalk.cyan.bold.underline(
      "config.json not detected! First time setup flow enabled on server."
    )
  );
  app.use("/", require("./setup/setup.js"));
}
