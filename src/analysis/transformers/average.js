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
        const teamTmps = dataset.tmps.filter(x => x.robotNumber == teamNumber); // only the tmps that are this team's

        // If the team has no tmps, set null and continue
        if (!teamTmps || teamTmps.length === 0) {
            setPath(team, outputPath, null);
            continue;
        }

        const pathResult = getPath(teamTmps[0], options.path, null);

        if (typeof pathResult == "object" && pathResult !== null) { // average all properties in object
            let out = {};

            // Collect all subkeys present across this team's tmps to handle heterogeneous objects
            const keySet = new Set();
            for (const tmp of teamTmps) {
                const obj = getPath(tmp, options.path, null);
                if (obj && typeof obj === 'object') {
                    for (const k of Object.keys(obj)) keySet.add(k);
                }
            }

            for (const subpath of keySet) {
                // filter tmps that actually have a numeric value for this subpath
                const values = teamTmps
                    .map(tmp => getPath(tmp, `${options.path}.${subpath}`, null))
                    .filter(v => v !== null && v !== undefined && !isNaN(Number(v)))
                    .map(v => Number(v));

                if (values.length === 0) {
                    out[subpath] = null;
                } else {
                    const avg = values.reduce((a, b) => a + b, 0) / values.length;
                    out[subpath] = avg;
                }
            }

            setPath(team, outputPath, out);
        } else { // normal numeric / null average
            const values = teamTmps
                .map(tmp => getPath(tmp, options.path, null))
                .filter(v => v !== null && v !== undefined && !isNaN(Number(v)))
                .map(v => Number(v));

            if (outputPath === "averages.climbTime") {
                console.log(`Team ${teamNumber}: filtering ${teamTmps.length} tmps for path ${options.path}`);
                console.log(`Filtered to ${values.length} tmps with values:`, values);
            }

            if (values.length == 0) {
                setPath(team, outputPath, null);
            } else {
                const average = values.reduce((acc, x) => acc + x, 0) / values.length;
                if (outputPath === "averages.climbTime") {
                    console.log(`Team ${teamNumber}: average climb time = ${average}`);
                }
                setPath(team, outputPath, average);
            }
        }
    }

    return dataset;
})
__/TEAM__