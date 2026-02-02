/**
 * averages time-based paths in TMPs and outputs as a path in team
 * @type {DataTransformer}
 * @param options.path {String} a time (timer) path in a tmp to be averaged,
 *                              or a path containing an object with time paths to be averaged
 */
__TEAM__
new DataTransformer("averageTime", (dataset, outputPath, options) => {

    for (const [teamNumber, team] of Object.entries(dataset.teams)) {
        const teamTmps = dataset.tmps.filter(x => x.robotNumber == teamNumber); // only this team's tmps
        const pathResult = getPath(teamTmps[0], options.path, null);

        if (typeof pathResult === "object" && pathResult !== null) {
            // average all properties in object (time values)
            let out = {};

            for (let subpath in getPath(teamTmps[0], options.path)) {
                const filteredTeamTmps = teamTmps.filter(
                    tmp => getPath(tmp, `${options.path}.${subpath}`, null) !== null
                );

                if (filteredTeamTmps.length == 0) {
                    out[subpath] = null;
                } else {
                    let average = filteredTeamTmps.reduce((acc, tmp) => {
                        return acc + getPath(tmp, `${options.path}.${subpath}`);
                    }, 0) / filteredTeamTmps.length;

                    out[subpath] = average;
                }
            }

            setPath(team, outputPath, out);

        } else {
            // normal time / null average
            const filteredTeamTmps = teamTmps.filter(
                tmp => getPath(tmp, options.path, null) !== null
            );

            if (filteredTeamTmps.length == 0) {
                setPath(team, outputPath, null);
            } else {
                let average = filteredTeamTmps.reduce((acc, tmp) => {
                    return acc + getPath(tmp, options.path);
                }, 0) / filteredTeamTmps.length;

                setPath(team, outputPath, average);
            }
        }
    }

    return dataset;
})
__/TEAM__
