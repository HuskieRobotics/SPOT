/**
 * @type {DataTransformer}
 * @param options.groups {Object[]} [{averagePath: "scores.phaseRating", countPaths: ["counts.phaseRating1", ...]}]
 */
__TMP__
new DataTransformer("average", (dataset, outputPath, options) => {
    function deriveCountPaths(averagePath) {
        const prefix = "scores.";
        if (!averagePath || !averagePath.startsWith(prefix)) {
            throw new Error(`sumAverage could not derive countPaths from ${averagePath}`);
        }

        const ratingMetrics = ["Passing", "Defense", "Storing", "Shooting"];
        const base = averagePath.slice(prefix.length);
        if (!base.endsWith("Rating")) {
            throw new Error(`sumAverage could not derive countPaths from ${averagePath}`);
        }

        const withoutRating = base.slice(0, -"Rating".length);
        const metric = ratingMetrics.find((name) => withoutRating.endsWith(name));
        if (!metric) {
            throw new Error(`sumAverage could not derive countPaths from ${averagePath}`);
        }

        const phase = withoutRating.slice(0, -metric.length);
        const countPrefix = `counts.${phase}Rating${metric}`;
        return [1, 2, 3, 4].map((num) => `${countPrefix}${num}`);
    }

    if (!options || !Array.isArray(options.groups)) {
        throw new Error("sumAverage requires options.groups")
    }

    for (let tmp of dataset.tmps) {
        let weightedSum = 0;
        let totalCount = 0;

        for (let group of options.groups) {
            const countPaths = group.countPaths || deriveCountPaths(group.averagePath);
            const groupCount = countPaths.reduce((acc, path) => {
                return acc + getPath(tmp, path, 0);
            }, 0);

            if (groupCount === 0) continue;

            const avg = getPath(tmp, group.averagePath, null);
            if (avg === null || typeof avg === "undefined") continue;

            weightedSum += avg * groupCount;
            totalCount += groupCount;
        }

        const average = totalCount === 0 ? null : weightedSum / totalCount;
        setPath(tmp, outputPath, average);
    }

    return dataset;
})
__/TMP__

/** averages paths in TMPs and outputs as a path in team
 * @type {DataTransformer}
 * @param options.path {String} a numerical path in a tmp to be averaged, or a path containing an object with numerical paths to be averaged
 */
__TEAM__
new DataTransformer("average", (dataset, outputPath, options) => {
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
__/TEAM__