const { Router } = require("express");
const mongoose = require("mongoose");
const chalk = require("chalk");
const axios = require("axios");
const config = require("../../lib/config");
const {
  validateConfig,
  getSetupInstructions,
  detectEnvironment,
} = require("../../lib/config");
let router = Router();

/**
 * Get current configuration status
 * Returns validation information and setup instructions
 */
router.get("/status", (req, res) => {
  const validation = validateConfig();
  const instructions = getSetupInstructions(validation);
  const environment = detectEnvironment();

  res.json({
    valid: validation.valid,
    missing: validation.missing,
    invalid: validation.invalid,
    environment: environment,
    instructions: instructions,
  });
});

/**
 * Auth endpoint for admin access
 * Checks if ACCESS_CODE is required and validates it
 */
router.get("/auth", (req, res) => {
  if (!config.secrets.ACCESS_CODE || config.secrets.ACCESS_CODE === "") {
    res.json({ status: 2 }); // No access code required
  } else if (config.secrets.ACCESS_CODE === req.headers.authorization) {
    res.json({ status: 1 }); // Authorized
  } else {
    res.json({ status: 0 }); // Unauthorized
  }
});

/**
 * Test database connection
 * Validates that a MongoDB URL can be connected to
 */
router.post("/test/database", async (req, res) => {
  const { databaseURL } = req.body;

  if (!databaseURL) {
    return res.status(400).json({
      success: false,
      error: "Missing databaseURL in request body",
    });
  }

  try {
    const connection = await mongoose
      .createConnection(databaseURL, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000, // 5 second timeout
      })
      .asPromise();

    await connection.close();

    res.json({
      success: true,
      message: "Successfully connected to database",
    });
  } catch (error) {
    console.error("Database connection test failed:", error);
    res.json({
      success: false,
      error: "Failed to connect to database",
      details: error.message,
    });
  }
});

/**
 * Test TBA API key
 * Validates that a TBA API key is valid
 */
router.post("/test/tba", async (req, res) => {
  const { tbaApiKey } = req.body;

  if (!tbaApiKey) {
    return res.status(400).json({
      success: false,
      error: "Missing tbaApiKey in request body",
    });
  }

  try {
    await axios.get("https://www.thebluealliance.com/api/v3/team/frc3061", {
      headers: {
        "X-TBA-Auth-Key": tbaApiKey,
      },
      timeout: 5000, // 5 second timeout
    });

    res.json({
      success: true,
      message: "TBA API key is valid",
    });
  } catch (error) {
    console.error("TBA API key test failed:", error);
    res.json({
      success: false,
      error: "Invalid TBA API key",
      details:
        error.response?.status === 401
          ? "API key rejected by TBA"
          : error.message,
    });
  }
});

/**
 * Get list of events from database
 * Requires a database URL to be provided
 */
router.post("/events", async (req, res) => {
  const { databaseURL } = req.body;

  if (!databaseURL) {
    return res
      .status(400)
      .json({ error: "Missing databaseURL in request body" });
  }

  try {
    const connection = await mongoose
      .createConnection(databaseURL, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      })
      .asPromise();

    const eventNumbers = await connection.db
      .collection("events")
      .find()
      .map((event) => event.code)
      .toArray();

    eventNumbers.sort((a, b) => b.localeCompare(a));
    await connection.close();

    res.json(eventNumbers);
  } catch (error) {
    console.error("Error fetching event numbers:", error);
    res.status(500).json({ error: "Failed to fetch event numbers" });
  }
});

/**
 * Create a new event code in the database
 */
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

    const existing = await connection.db
      .collection("events")
      .findOne({ code: eventCode });

    if (!existing) {
      await connection.db.collection("events").insertOne({ code: eventCode });
      created = true;
    }

    await connection.close();

    if (created) {
      res.status(201).json({ success: true, message: "Event code created" });
    } else {
      res.status(409).json({ error: "Event code already exists" });
    }
  } catch (error) {
    console.error("Error creating event code:", error);
    res.status(500).json({ error: "Failed to create event code" });
  }
});

module.exports = router;
