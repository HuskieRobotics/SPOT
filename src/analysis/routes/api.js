const { Router } = require("express");
const executeAnalysisPipeline = require("../analysisPipeline.js")
const axios = require("axios")
const config = require("../../../config/config.json")

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

module.exports = router;