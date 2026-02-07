/**
 * Centralized configuration loader
 * Reads all configuration from environment variables
 * Supports .env files for local development and server environment variables for production
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");

/**
 * Configuration object - all values loaded from environment variables
 */
const config = {
  secrets: {
    DATABASE_URL: process.env.DATABASE_URL || "",
    TBA_API_KEY: process.env.TBA_API_KEY || "",
    GOOGLE_AUTH: {
      CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
      CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
    },
    FMS_API_USERNAME: process.env.FMS_API_USERNAME || "",
    FMS_API_KEY: process.env.FMS_API_KEY || "",
    ACCESS_CODE: process.env.ACCESS_CODE || "", // Optional - if not set, admin access is unrestricted
  },
  EVENT_NUMBER: process.env.EVENT_NUMBER || "",
  VERSION: process.env.VERSION || "0.0",
  TBA_EVENT_KEY: process.env.TBA_EVENT_KEY || "",
};

/**
 * Required environment variables for the app to function
 */
const REQUIRED_VARS = [
  "DATABASE_URL",
  "TBA_API_KEY",
  "EVENT_NUMBER",
  "TBA_EVENT_KEY",
];

/**
 * Optional environment variables (with defaults or conditional usage)
 */
const OPTIONAL_VARS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "FMS_API_USERNAME",
  "FMS_API_KEY",
  "ACCESS_CODE",
  "VERSION",
];

/**
 * Detect if we're running in local development or production
 * @returns {Object} { isLocal: boolean, hasEnvFile: boolean, hasAnyEnvVars: boolean }
 */
function detectEnvironment() {
  const hasEnvFile = fs.existsSync(path.join(__dirname, "../../.env"));
  const hasAnyEnvVars = REQUIRED_VARS.some((varName) => process.env[varName]);
  const isLocal = !hasAnyEnvVars && !hasEnvFile;

  return {
    isLocal,
    hasEnvFile,
    hasAnyEnvVars,
  };
}

/**
 * Validate configuration and return detailed error information
 * @returns {Object} { valid: boolean, missing: string[], invalid: string[], environment: Object }
 */
function validateConfig() {
  const env = detectEnvironment();
  const missing = [];
  const invalid = [];

  // Check for missing required variables
  REQUIRED_VARS.forEach((varName) => {
    const value = process.env[varName];
    if (!value || value.trim() === "") {
      missing.push(varName);
    }
  });

  // Validate DATABASE_URL format (basic check)
  if (
    process.env.DATABASE_URL &&
    !process.env.DATABASE_URL.startsWith("mongodb")
  ) {
    invalid.push({
      name: "DATABASE_URL",
      issue:
        'Must be a valid MongoDB connection string (should start with "mongodb://" or "mongodb+srv://")',
    });
  }

  // Validate EVENT_NUMBER format (basic check)
  if (process.env.EVENT_NUMBER && !process.env.EVENT_NUMBER.includes("_")) {
    invalid.push({
      name: "EVENT_NUMBER",
      issue:
        'Should be in format like "2025ilch_official" (year + event code + underscore + type)',
    });
  }

  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
    environment: env,
  };
}

/**
 * Get helpful setup instructions based on environment
 * @param {Object} validation - Result from validateConfig()
 * @returns {Object} { title: string, message: string, instructions: string[] }
 */
function getSetupInstructions(validation) {
  const { environment, missing, invalid } = validation;

  if (environment.isLocal && !environment.hasEnvFile) {
    // Local development, no .env file
    return {
      title: "Environment Configuration Required",
      message:
        "No .env file found. For local development, you need to create a .env file.",
      instructions: [
        '1. Create a file named ".env" in the root directory of this project',
        '2. Copy the contents from ".env.example" as a template',
        "3. Fill in the required values (see setup page for details on where to get each value)",
        "4. Restart the server",
        "",
        "Required environment variables:",
        ...REQUIRED_VARS.map((v) => `  - ${v}`),
        "",
        "Optional environment variables:",
        ...OPTIONAL_VARS.map((v) => `  - ${v}`),
        "",
        "Visit http://localhost:8080/setup for detailed setup instructions.",
      ],
    };
  } else if (missing.length > 0 || invalid.length > 0) {
    // Some variables are missing or invalid
    const instructions = [];

    if (missing.length > 0) {
      instructions.push("Missing required environment variables:");
      missing.forEach((varName) => {
        instructions.push(`  - ${varName}`);
      });
      instructions.push("");
    }

    if (invalid.length > 0) {
      instructions.push("Invalid environment variables:");
      invalid.forEach(({ name, issue }) => {
        instructions.push(`  - ${name}: ${issue}`);
      });
      instructions.push("");
    }

    if (environment.isLocal || environment.hasEnvFile) {
      instructions.push("For local development:");
      instructions.push(
        "  1. Update your .env file with the missing/corrected values",
      );
      instructions.push("  2. Restart the server");
    } else {
      instructions.push("For production/cloud deployment:");
      instructions.push(
        "  1. Add the missing environment variables in your hosting provider dashboard",
      );
      instructions.push(
        "  2. For Render: Dashboard → Environment → Add Environment Variable",
      );
      instructions.push("  3. Redeploy or restart the service");
    }

    instructions.push("");
    instructions.push(
      "Visit /setup for detailed instructions on where to get each value.",
    );

    return {
      title: "Configuration Error",
      message: "Some required environment variables are missing or invalid.",
      instructions,
    };
  }

  return {
    title: "Configuration Valid",
    message: "All required environment variables are set.",
    instructions: [],
  };
}

/**
 * Get a sanitized version of config (without secrets) for client-side use
 * @returns {Object} Config object with secrets removed
 */
function getPublicConfig() {
  return {
    EVENT_NUMBER: config.EVENT_NUMBER,
    VERSION: config.VERSION,
    TBA_EVENT_KEY: config.TBA_EVENT_KEY,
  };
}

module.exports = config;
module.exports.validateConfig = validateConfig;
module.exports.getSetupInstructions = getSetupInstructions;
module.exports.getPublicConfig = getPublicConfig;
module.exports.detectEnvironment = detectEnvironment;
