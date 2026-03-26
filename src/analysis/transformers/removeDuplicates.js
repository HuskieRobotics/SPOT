/**
 * @type {DataTransformer}
 * Removes duplicate TMPs for the same team and match, keeping only the latest one based on the timestamp.
 */
__TMP__
new DataTransformer("removeDuplicates", (dataset) => {
    // Track the latest TMP for each team-match combination.
    const latestTmpsByTeamMatch = {};
    
    for (let tmp of dataset.tmps) {
        const key = `${tmp.robotNumber}-${tmp.matchNumber}`;
        const existingTmp = latestTmpsByTeamMatch[key];

        // Keep the latest timestamp and drop older duplicate scouts for the same team-match.
        if (!existingTmp || tmp.timestamp > existingTmp.timestamp) {
            latestTmpsByTeamMatch[key] = tmp;
        }
    }
    
    dataset.tmps = Object.values(latestTmpsByTeamMatch);
    
    return dataset;
})
__/TMP__