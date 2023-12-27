const { unwatchFile } = require("fs");

express = require("express");

var schedule = {};
var tempTeams = [];

let router = express.Router();

router.use(express.static(__dirname + "/public"));

router.get("/", (req,res) => {
    res.render(__dirname + "/views/index.ejs");
})

router.post('/matches',(req,res)=>{
    console.log("req body on /schedule/matches")
    schedule = req.body;
    addTeam(req.body);

    res.send(200)
})
router.get('/matches',(req,res)=>{
    res.send(schedule);
})

router.use("/api", require("./routes/api.js"));

router.get("/tempteams", async (req, res) => {
    res.send(tempTeams);
});

const addTeam = (matchLists) => {
    var teams = [];

    for (let i = 0; i < matchLists.length; i++) {
        const element = matchLists[i];

        element.robots.blue.forEach(teamNumber => {
            if (!teams.includes(teamNumber)) {
                teams.push({team_number: teamNumber, nickname: "temp team"});
            }
        });

        element.robots.red.forEach(teamNumber => {
            if (!teams.includes(teamNumber)) {
                teams.push({team_number: teamNumber, nickname: "temp team"});
            }
        });
    }

    tempTeams = teams;
}

module.exports = router;
