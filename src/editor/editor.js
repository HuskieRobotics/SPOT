express = require("express");
const { readdirSync } = require("fs");

let router = express.Router();

router.use(express.static(__dirname + "/public"));

router.get("/", (req, res) => {
  res.render(__dirname + "/views/index.ejs", {
    pages: readdirSync(__dirname + "/views/parts"),
  });
});

router.use("/api", require("./routes/api.js"));

module.exports = router;
