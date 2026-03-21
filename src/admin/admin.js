express = require("express");
const config = require("../../config/config.json");

let router = express.Router();

router.use(express.static(__dirname + "/public"));

router.get("/", (req, res) => {
  res.render(__dirname + "/views/index.ejs");
});

router.get("/restart", (req, res) => {
  const key = req.headers.authorization;

  if (key == config.secrets.ACCESS_CODE) {
    process.exit(0);
  } else {
    res.sendStatus(400);
  }
});

router.use("/api", require("./routes/api.js"));

module.exports = router;
