express = require("express");

let router = express.Router();

router.use(express.static(__dirname + "/public"));

router.get("/", (req,res) => {
    res.render(__dirname + "/views/index.ejs");
})

router.use("/api", require("./routes/api.js"));

module.exports = router;