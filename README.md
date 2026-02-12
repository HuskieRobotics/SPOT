<div align="center">
  <img src="src/scouting/public/img/SPOTBanner.jpg" width=50% height=50%>
</div>

# SPOT - Scouting Platforms On Time

SPOT is an open-source modular scouting app framework for FRC developed by Team 3061, Huskie Robotics. SPOT provides a simple platform upon which a team can build a scouting app with little to no prior experience.

## Database Migration (SPOT v4 -> v5)

The database schema for SPOT v5 and later is incompatible with SPOT v4 and earlier. If you don't have data from SPOT v4 or earlier, no migration is required. If you are creating a new database to use with SPOT v5 or later, which is recommended for a new FRC season, no migration is required. If you have data from SPOT v4 or earlier and you want to access it with SPOT v5 or later, migration is required. Refer to the [migration guide](https://docs.google.com/document/d/e/2PACX-1vT-4zxXgeCIOai_fIJwoPhzDs3wWO5fdo-dLJVkPmhtUIvn2NyJjXRBU67fSyDcoUWjL9kp-1UMtNiB/pub) for more information.

## Features

- An easy-to-use platform for data entry throughout matches.
- Works on all platforms, from iOS to Android to the web.
- An analysis page to display detailed statistics and charts about matches and teams.
- Scores Imported from TBA for accuracy
- Admin view for live scouter management at the competition.
- Admins can monitor and verify incoming scouting data to ensure accuracy and consistency throughout the event.
- Preconfigured for the 2026 REBUILT game with no additional game-specific customization required.
- Easy deployment experience when teams run a server on Render.
- Optimized for teams who have internet access while scouting, but also completely functional for teams with no internet access. [(workflow found here)](https://docs.google.com/document/d/e/2PACX-1vRVXPGirIs_T6EMiAWL_YhG9LXGgbZCH3n0iP5phAYMcYILqNsBTYlxgWW7vkJHRQtXqWpTP7Uwcyo8/pub).
- Quick setup with a built-in first-run wizard to walk teams through configuring their scouting app, connecting to The Blue Alliance or FRC API, and setting up their database.
- Completely configurable analysis and scouting view without the need for a single line of code.
- Easy data deletion

SPOT is built with HTML, JS, CSS, and Node.js and operates with a MongoDB database.

### SPOT is designed for a wide range of teams with a wide range of expertise and requirements:

1. A team that is new to scouting and isn't sure what information to gather or how to analyze their data. SPOT comes as a preconfigured app that can be deployed with minimal setup and will provide all the basic functionality needed by most teams.
2. A team that has some experience with scouting and wants to collect specific data that may not be part of the default configuration but that doesn't have significant programming experience. SPOT can be configured by modifying configuration files rather than by writing code.
3. A team that has experience with scouting and wants to perform custom analysis operations or advanced custom scouting interfaces and has some programming experience. SPOT can utilize user-provided analysis modules to extend its functionality beyond the default configuration without requiring teams to modify the base code.
4. A team that has significant experience with scouting and significant programming expertise. SPOT is open source, documented, and designed to extensible such that teams can start from this code base and build their own custom scouting system.

## Guiding Principles

- SPOT's goal is to provide a universal scouting app platform that can function with any past or future FIRST Robotics game by just changing the configuration.
- SPOT does not require you to write code to configure, set up, or use SPOT.
- SPOT does not require you to be online for its most basic features (scouting, data analysis)

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes, as well as deployed on a server (Glitch or Amazon Web Services). If you have any questions, feel free to contact us [spot@team3061.org](mailto:spot@team3061.org).

### [Quickstart](https://docs.google.com/document/d/e/2PACX-1vQyMGqxn7CdAM1srgcaQKJGnJawiVCH-nxSbhq_hm0jYA9e2-axnV-mmqxOveJp5lX3TMohQieNe1Ft/pub)

## Usage

This is a guide on how to use SPOT as well as its features, with a text and a video walkthrough.

### [Usage Guide](https://docs.google.com/document/d/e/2PACX-1vTwLwWJwcn1WdrNSZLGY33f04TjXjwypreY7mTkSBck8K20i9injrl6MUOrHQLrpy9u8UvQu99XHLge/pub)

## Environment Configuration

SPOT uses environment variables for configuration. This approach provides security for sensitive credentials and flexibility for different deployment environments (local development, cloud hosting, etc.).

### Required Environment Variables

The following environment variables must be set for SPOT to function:

- **`DATABASE_URL`** - MongoDB connection string
  - Get this from MongoDB Atlas (cloud.mongodb.com) or your local MongoDB installation
  - Format: `mongodb+srv://username:password@cluster.mongodb.net/database`
- **`TBA_API_KEY`** - The Blue Alliance API key
  - Get this from [The Blue Alliance Account Settings](https://www.thebluealliance.com/account)
  - Navigate to Account → Read API Keys
- **`EVENT_NUMBER`** - Event identifier for the competition
  - Format: `{year}{region}{eventCode}_{type}` (e.g., `2025ilch_official`)
  - Find event codes at [The Blue Alliance Events](https://www.thebluealliance.com/events)
- **`TBA_EVENT_KEY`** - TBA event key for API calls
  - Usually the same as `EVENT_NUMBER`

### Optional Environment Variables

- **`VERSION`** - Application version (defaults to "0.0")
- **`ACCESS_CODE`** - Admin access code (if not set, admin access is unrestricted)
- **`GOOGLE_CLIENT_ID`** - Google OAuth client ID (for authentication features)
- **`GOOGLE_CLIENT_SECRET`** - Google OAuth client secret
- **`FMS_API_USERNAME`** - FMS API username (for official events with FMS access)
- **`FMS_API_KEY`** - FMS API key

### Local Development Setup

1. **Copy the environment template:**

   ```bash
   # Windows (PowerShell)
   Copy-Item .env.example .env

   # macOS/Linux
   cp .env.example .env
   ```

2. **Edit `.env` file:**
   Open the `.env` file in a text editor and fill in your values:

   ```env
   DATABASE_URL=mongodb+srv://username:password@cluster.mongodb.net/spot_db
   TBA_API_KEY=your_tba_api_key_here
   EVENT_NUMBER=2025ilch_official
   TBA_EVENT_KEY=2025ilch_official
   VERSION=1.0.0
   ACCESS_CODE=your_secure_code
   ```

3. **Restart the server:**
   ```bash
   npm start
   ```

**Important:** Never commit your `.env` file to version control! It's already listed in `.gitignore`.

### Production Deployment (Render, Heroku, etc.)

For cloud deployments, configure environment variables in your hosting provider's dashboard:

#### Render.com

1. Log in to [dashboard.render.com](https://dashboard.render.com)
2. Select your SPOT service
3. Click "Environment" in the sidebar
4. Click "Add Environment Variable"
5. Add each required variable (name and value)
6. Deploy or restart the service

#### Other Platforms

Most hosting platforms provide an environment variables section in their dashboard. Add the same variables listed above.

### Setup Page

If required environment variables are missing, SPOT will display a setup page at `http://localhost:8080/setup` with:

- Status of your current configuration
- Detailed instructions for local and production setup
- Links to obtain API keys and credentials
- Complete reference of all environment variables

## Configuration

This is a guide to configuring SPOT. You can configure the buttons displayed in the scouting view as well as how data is transformed and displayed.

### [Configuration Guide](https://docs.google.com/document/d/e/2PACX-1vRL0EauWWVXWEu9jQJ37-8SI6dSUrGMm6z2wrqwH6HYOA8FarEFugxXrZluRrI_Tpy92qqM9rypbhgr/pub)

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on contributing to SPOT.

## Documentation

Documentation of the core codebase is currently partially included in files. Check back soon for in-depth documentation later!

## Authors

- **Dylan Schmit** - _Initial work_ - [cyandev](https://github.com/cyandev)
- **Nithilan Kalidoss** - _Initial work_ - [nithilan4](https://github.com/nithilan4)

See also the list of [contributors](https://github.com/HuskieRobotics/SPOT/contributors) who participated in this project.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE.md](LICENSE) file for details
