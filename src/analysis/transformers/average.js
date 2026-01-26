/** averages paths in TMPs and outputs as a path in team
 * @type {DataTransformer}
 * @param options.path {String} a numerical path in a tmp to be averaged, or a path containing an object with numerical paths to be averaged
 */
__TEAM__
new DataTransformer("average", (dataset, outputPath, options) => {
    if (outputPath === "averages.climbTime") {
        console.log(`AVERAGE TRANSFORMER CALLED for ${outputPath}, path: ${options.path}`);
    }
    for (const [teamNumber, team] of Object.entries(dataset.teams)) {
        const teamTmps = dataset.tmps.filter(x=>x.robotNumber == teamNumber); //only the tmps that are this team's
        const pathResult = getPath(teamTmps[0], options.path, null)

            if (typeof pathResult == "object" && pathResult !== null) { //average all properties in object
            let out = {};
            for (let subpath in getPath(teamTmps[0], options.path)) {
                    const filteredTeamTmps = teamTmps.filter((tmp) => getPath(tmp, `${options.path}.${subpath}`, null) !== null)
                    if (filteredTeamTmps.length == 0) {
                        out[subpath] = null;
                    } else {
                        let average = filteredTeamTmps.reduce((acc, tmp) => {
                            return acc + getPath(tmp, `${options.path}.${subpath}`)
                        }, 0) / filteredTeamTmps.length;
                        out[subpath] = average;
                    }
            }
            setPath(team, outputPath, out)
        } else { //normal numeric / null average
                const filteredTeamTmps = teamTmps.filter((tmp) => getPath(tmp, options.path, null) !== null)
                if (outputPath === "averages.climbTime") {
                    console.log(`Team ${teamNumber}: filtering ${teamTmps.length} tmps for path ${options.path}`);
                    console.log(`Filtered to ${filteredTeamTmps.length} tmps with values:`, filteredTeamTmps.map(tmp => getPath(tmp, options.path)));
                }
                if (filteredTeamTmps.length == 0) {
                    setPath(team, outputPath, null)
                } else {
                    let average = filteredTeamTmps.reduce((acc, tmp) => {
                        return acc + getPath(tmp, options.path)
                    }, 0) / filteredTeamTmps.length
                    if (outputPath === "averages.climbTime") {
                        console.log(`Team ${teamNumber}: average climb time = ${average}`);
                    }
                    setPath(team, outputPath, average)
                }
        }
    }

    return dataset;
})
__/TEAM__