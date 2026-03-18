express = require("express");
const pm2 = require("pm2");

let router = express.Router();

router.use(express.static(__dirname + "/public"));

router.get("/", (req, res) => {
  res.render(__dirname + "/views/index.ejs");
});

router.get("/restart/:key", (req, res) => {
  const key = req.params.key;

  if (key == "Yes") {
    pm2.connect(pm2.restart("spot"), (err, proc) => {
      if (!err) {
        res.sendStatus(200);
      } else {
        res.sendStatus(400);
      }
      pm2.disconnect();
    });
  } else {
    res.sendStatus(400);
  }
});

router.use("/api", require("./routes/api.js"));

module.exports = router;
