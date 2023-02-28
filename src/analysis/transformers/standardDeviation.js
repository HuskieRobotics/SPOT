const{ getPath, setPath } = require("../../lib/util");
const{ DataTransformer } = require("../DataTransformer");

module.exports = {
	/**
  find standard deviation
	@type { DataTransformer }
	@param options.path {String}
	*/
  /*
  const n = array.length
  const mean = array.reduce((a, b) => a + b) / n
  return Math.sqrt(array.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n)
  */
	team: new DataTransformer("standardDeviation", (dataset, outputPath, options) => {
    for (let [teamNumber,team] of Object.entries(dataset.teams)) {
      let teamTmps = dataset.tmps.filter(x=>x.robotNumber == teamNumber); //only the tmps that are this team's
      let scores = []
      for (let tmp of teamTmps) {
        scores.push(getPath(tmp,options.path))
      }
      let n = scores.length
      let mean = scores.reduce((a, b) => a + b) / n
      let sd = Math.sqrt(scores.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n)
      console.log(scores)
      console.log(mean)
      console.log(sd)
      setPath(team,outputPath,sd)
    }
    
    return dataset;
  })
}