/**
 * @type {DataTransformer}
 * Removes duplicate TMPs for the same team and match, keeping only the most recent one
 */
__TMP__
new DataTransformer("removeDuplicates", (dataset) => {
    // Create a map to track the most recent TMP for each team-match combination
    const latestTmpsByTeamMatch = {};
    
    for (let tmp of dataset.tmps) {
        const key = `${tmp.robotNumber}-${tmp.matchNumber}`;

        // If this is the first TMP for this team-match, or if it's more recent than the stored one, update it
        if (!latestTmpsByTeamMatch[key] || tmp.timestamp > latestTmpsByTeamMatch[key].timestamp) {
            latestTmpsByTeamMatch[key] = tmp;
        }
    }
    
    // Filter dataset.tmps to keep only the latest TMP for each team-match combination
    dataset.tmps = Object.values(latestTmpsByTeamMatch);
    
    return dataset;
})
__/TMP__