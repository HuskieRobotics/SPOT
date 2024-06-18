// Import the express module
const express = require("express");
// Import the TeamMatchPerformance model from the db.js file in the lib directory
const { TeamMatchPerformance } = require("../lib/db.js");

// Create a new router object
let route = express.Router();

// Use the express.static middleware to serve static files from the public directory
route.use(express.static(__dirname + "/public"));

// Define a route for GET requests to the root URL ("/")
route.get("/", (req, res) => {
  // Render the index.ejs file in the views directory
  res.render(__dirname + "/views/index.ejs");
});

// Use the router object from the api.js file in the routes directory for all routes starting with "/api"
route.use("/api", require("./routes/api.js"));

// Export the router object
module.exports = route;
