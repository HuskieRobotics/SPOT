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
    let headerRow = true;
    let checkData  = function(team){
      if(Object.entries(team).filter(([key,value])=>key!="manual").length == 0){
        return false
      } 
      return true
    }
  
    for (let [teamNumber,team] of Object.entries(dataset.teams).filter(([num,team])=>checkData(team)) ) {
      if(headerRow){
        headerRow = false;
        rows.push(["Team #",
          ...Object.entries(team.averages).filter(([key,value])=>!isNaN(value)&&value).map(([i,x]) => i+" Average"), //all averages
            ...Object.entries(team.averageScores).filter(item=>!isNaN(item)).map(([i,x]) => i+" Score Average"), //all averages
            "Average Cycle",
            "Average Completed Cycle"
        ])
      }
      rows.push([teamNumber,
            ...Object.entries(team.averages).filter(([key,value])=>!isNaN(value)&&value).map(([i,x]) => x), //all averages
            ...Object.entries(team.averageScores).filter(item=>!isNaN(item)).map(([i,x]) => x), //all averages
            team.cycle.averageTime,
            team.cycle.averageTimeComplete
      ])
      
    } 

    //make into csv
    let csv = rows.map(row => row.reduce((acc,value) => acc+`,${value}`)).reduce((acc,row) => acc+`${row}\n`, "");
    res.set({"Content-Disposition":`attachment; filename="teams.csv"`});
    res.send(csv);
  })

module.exports = router;