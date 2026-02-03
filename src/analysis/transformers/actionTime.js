__TMP__
new DataTransformer("actionTime", (dataset, outputPath, options) => {
    const actionIds = Array.isArray(options.actionId)
        ? options.actionId
        : [options.actionId];

    for (let tmp of dataset.tmps) {
        let found = false;

        for (let action of tmp.actionQueue) {
            if (actionIds.includes(action.id)) {
                setPath(tmp, outputPath, action.ts);
                found = true;
                break; // first occurrence only
            }
        }

        if (!found) {
            setPath(tmp, outputPath, options.default ?? null);
        }
    }

    return dataset;
})
__/TMP__
