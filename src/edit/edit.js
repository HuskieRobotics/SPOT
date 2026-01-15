express = require("express");
const axios = require("axios");
const config = require("../../config/config.json");

let router = express.Router();

router.use(express.static(__dirname + "/public"));

router.get("/", (req, res) => {
  res.render(__dirname + "/views/index.ejs");
});

router.get("/blueApiData", async (req, res) => {
  const TBA_EVENT_KEY = config.TBA_EVENT_KEY;
  const TBA_API_KEY = config.secrets.TBA_API_KEY;

  const tbaResults = (
    await axios.get(
      `https://www.thebluealliance.com/api/v3/event/${TBA_EVENT_KEY}/matches`,
      {
        headers: {
          "X-TBA-Auth-Key": TBA_API_KEY,
        },
      }
    )
  ).data;

  res.send(tbaResults);
});

module.exports = router;
