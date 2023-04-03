express = require("express");

var schedule = {};
let router = express.Router();

router.use(express.static(__dirname + "/public"));

router.get("/", (req,res) => {
    res.render(__dirname + "/views/index.ejs");
})

router.post('/matches',(req,res)=>{
    
    console.log("req body on /schedule/matches")
    console.log(req.body)
    schedule = req.body;
    res.send(200)
})
router.get('/matches',(req,res)=>{
    res.send(schedule)
})

//add a method that gets at the schedule and then call that method from the serverside file to grab it (no need for route or axios)
router.use("/api", require("./routes/api.js"));

module.exports = router;