express = require("express");

let router = express.Router();

router.use(express.static("public"));

router.get("/", (req,res) => {
    res.render("./views/index.ejs");
})

router.use("/api", require("./routes/api.js"));

module.exports = router;