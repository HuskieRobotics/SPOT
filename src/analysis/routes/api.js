const { Router } = require("express");
const executeAnalysisPipeline = require("../analysisPipeline.js")
const axios = require("axios")
const config = require("../../../config/config.json");

let router = Router();

router.get("/dataset", async (req, res) => {
    res.json(await executeAnalysisPipeline())
})

if (!config.secrets.TBA_API_KEY) {
    console.error(chalk.whiteBright.bgRed.bold("TBA_API_KEY not found in config.json file! SPOT will not properly function without this."))
}

router.get("/teams", async (req, res) => {
    if (!config.secrets.TBA_API_KEY) {
        return res.json([]); //no key, no teams
    }
    let tbaTeams = (await axios.get(`https://www.thebluealliance.com/api/v3/event/${config.TBA_EVENT_KEY}/teams`, {
        headers: {
            "X-TBA-Auth-Key": config.secrets.TBA_API_KEY
        }
    }).catch(e => console.log(e,chalk.bold.red("\nError fetching teams from Blue Alliance API!")))).data;
    res.json(tbaTeams)
})

router.get("/csv", async (req,res) => {
    let dataset = await executeAnalysisPipeline();

    //create rows
    let rows = [];
    let headerRow = false;
    for (let [teamNumber,team] of Object.entries(dataset.teams) ) {
        console.log(team.counts)
        if (!headerRow) {
            headerRow = true;
            rows.push(["Team Number", 
                ...Object.entries(team.counts).map(([i,x]) => i+" Count"), //all counts
                ...Object.entries(team.averages).map(([i,x]) => i+" Average"), //all averages
                ...Object.entries(team.averageScores).map(([i,x]) => i+" Average Score"), //average scores
                "Time Per Ball",
                "Possible Climbs",
                "Accuracy", //accuracy,
				...Object.entries(team.averageScores).map(([i,x]) => i+"Average"), //all averages
            ])
        }
        rows.push([teamNumber, 
            ...Object.entries(team.counts).map(([i,x]) => x), //all counts
            ...Object.entries(team.averages).map(([i,x]) => x), //all averages
            ...Object.entries(team.averageScores).map(([i,x]) => x), //all averages
            team.timePerBall,
            team.possibleClimbs,
            team.accuracy, //accuracy
			...Object.entries(team.averageScores).map(([i,x]) => x), //all averages
        ])
    }

    //make into csv
    let csv = rows.map(row => row.reduce((acc,value) => acc+`,${value}`)).reduce((acc,row) => acc+`${row}\n`, "");
    res.set({"Content-Disposition":`attachment; filename="teams.csv"`});
    res.send(csv);
})

module.exports = router;