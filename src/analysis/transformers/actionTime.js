/**
 * find the first time an action occurs in the action queue of a tmp and outputs it to a field
 * @type {DataTransformer}
 * @param options.actionId {String} the actionId of the action to find the time of.
 * @param options.default {Object} the default value (if it didn't occur)
 */
__TMP__
new DataTransformer("actionTime", (dataset, outputPath, options) => {
    for (let tmp of dataset.tmps) {
        let found = false;
        // support options.actionId as string or array
        const actionIds = Array.isArray(options.actionId) ? options.actionId : [options.actionId];
        for (let action of tmp.actionQueue) {
            for (const aid of actionIds) {
                if (!aid) continue;
                if (action.id === aid || action.id.toLowerCase() === String(aid).toLowerCase()) {
                    console.log(`Found ${aid} for team ${tmp.robotNumber}, match ${tmp.matchNumber}, timestamp: ${action.ts}`);
                    setPath(tmp, outputPath, action.ts);
                    found = true;
                    break;
                }
            }
            if (found) break; // Only capture the first matching occurrence
        }
        if (!found) {
            setPath(tmp, outputPath, options.default || null);
        }
    }
    return dataset;
})
__/TMP__