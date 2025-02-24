express = require("express");
const config = require("../../config/config.json");

let router = express.Router();

router.use(express.static(__dirname + "/public"));

router.get("/", (req, res) => {
  if (req.headers.authorization === config.secrets.ACCESS_CODE) {
    res.render(__dirname + "/views/index.ejs");
  } else {
    console.log("Unauthorized access attempt to admin panel");
    res.redirect("/admin");
  }
});

module.exports = router;
