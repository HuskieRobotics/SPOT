express = require("express");
const axios = require("axios");
const { setPath } = require("../lib/util");
const config = require("../../config/config.json");

let router = express.Router();

router.use(express.static(__dirname + "/public"));

router.get("/", (req, res) => {
  res.render(__dirname + "/views/index.ejs");
});

module.exports = router;
