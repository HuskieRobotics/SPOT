const express = require("express");
let app = express();
const server = app.listen(process.env.PORT || 8080, () => {
  console.log(
    chalk.cyan(`Server listening on port ${process.env.PORT || 8080}`),
  );
});
const chalk = require("chalk");

const axios = require("axios");
axios.defaults.baseURL = `http://localhost:${process.env.PORT || 8080}`;

app.set("view engine", "ejs");
let bodyParser = require("body-parser");
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Load configuration from environment variables
const config = require("./lib/config");
const { validateConfig, getSetupInstructions } = require("./lib/config");

// Validate configuration
const validation = validateConfig();

if (!validation.valid) {
  const instructions = getSetupInstructions(validation);

  console.log(chalk.yellow.bold(`\n⚠️  ${instructions.title}`));
  console.log(chalk.yellow(instructions.message));
  console.log(chalk.white(instructions.instructions.join("\n")));
  console.log("");

  // Always mount setup route for configuration guidance
  app.use("/", require("./setup/setup.js"));
} else {
  // Configuration is valid - mount all application routes
  console.log(chalk.green.bold("✓ Configuration loaded successfully"));
  console.log(chalk.cyan(`Event: ${config.EVENT_NUMBER}`));
  console.log(chalk.cyan(`Version: ${config.VERSION}`));
  console.log("");

  require("./scouting/scouting-sync.js")(server);

  app.use("/config", require("./configRouter.js"));
  app.use("/", require("./scouting/scouting.js"));
  app.use("/analysis", require("./analysis/analysis.js"));
  app.use("/admin", require("./admin/admin.js"));
  app.use("/qrscanner", require("./qrscanner/qrscanner.js"));
  app.use("/edit", require("./edit/edit.js"));
  app.use("/setup", require("./setup/setup.js"));
  app.use("/schedule", require("./schedule/schedule").router);
}
