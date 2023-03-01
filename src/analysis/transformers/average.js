const { getPath, setPath } = require("../../lib/util");
const {DataTransformer} = require("../DataTransformer");

module.exports = {
    /** averages paths in TMPs and outputs as a path in team
     * @type {DataTransformer}
     * @param options.path {String} a numerical path in a tmp to be averaged, or a path containing an object with numerical paths to be averaged
     */
    team: new DataTransformer("average", (dataset, outputPath, options) => {
        for (const [teamNumber, team] of Object.entries(dataset.teams)) {
            const teamTmps = dataset.tmps.filter(x=>x.robotNumber == teamNumber); //only the tmps that are this team's
            const pathResult = getPath(teamTmps[0], options.path)

          if (typeof pathResult == "object" && pathResult !== null) { //average all properties in object
				let out = {};
                for (let subpath in getPath(teamTmps[0], options.path)) {
                  
					const filteredTeamTmps = teamTmps.filter((tmp) => getPath(tmp, `${options.path}.${subpath}`,null) !== null)
                  let average = filteredTeamTmps.reduce((acc, tmp) => {
                        return acc + getPath(tmp, `${options.path}.${subpath}`) //if this is causing an error, your tmps may not have the same schema (eg. some keys (which you are trying to average) are not defined in some tmps)
                    }, 0) / filteredTeamTmps.length;
                    out[subpath] = average;
                }
                setPath(team, outputPath, out)
			} else { //normal numeric / null average
				const filteredTeamTmps = teamTmps.filter((tmp) => getPath(tmp, options.path) !== null)
                let average = filteredTeamTmps.reduce((acc, tmp) => {
                    return acc + getPath(tmp, options.path)
                }, 0) / filteredTeamTmps.length

				setPath(team, outputPath, average)
            }
        }

        return dataset;
    })
}