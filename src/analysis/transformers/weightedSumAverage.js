/**
 * 
 * @type {DataTransformer}
 * @param options.weightedPaths {Object} {"pathString": weight}
 */
__TMP__
new DataTransformer("weightedSumAverage", (dataset, outputPath, options) => {
    for (let tmp of dataset.tmps) {
        let weightedSum = 0;
        let totalCount = 0;

        for (let [pathString, weight] of Object.entries(options.weightedPaths)) {
            let count = getPath(tmp, pathString, 0);

            weightedSum += count * weight;
            totalCount += count;
        }

        let average = totalCount === 0 ? null : weightedSum / totalCount;
        setPath(tmp, outputPath, average);
    }

    return dataset;
})
__/TMP__

/**
 * @type {DataTransformer}
 * @param options.path {String} Path to nested rating-count object on tmp
 */
__TEAM__
new DataTransformer("weightedSumAverage", (dataset, outputPath, options) => {
    options = Object.assign({ path: "" }, options);

    const mergeCounts = (target, source) => {
        if (typeof source === "number") {
            return (typeof target === "number" ? target : 0) + source;
        }

        if (typeof source !== "object" || source === null) {
            return target;
        }

        const merged = (typeof target === "object" && target !== null) ? target : {};

        for (const [key, value] of Object.entries(source)) {
            merged[key] = mergeCounts(merged[key], value);
        }

        return merged;
    };

    const weightedAverageNested = (obj) => {
        if (typeof obj === "number") {
            return obj;
        }

        if (typeof obj !== "object" || obj === null) {
            return null;
        }

        const entries = Object.entries(obj);
        const allNumberValues = entries.length > 0 && entries.every(([, value]) => typeof value === "number");

        if (allNumberValues) {
            let weightedSum = 0;
            let totalCount = 0;
            let usedWeightedKey = false;

            for (const [key, count] of entries) {
                const keyMatch = String(key).match(/(\d+)(?!.*\d)/);
                if (!keyMatch) {
                    continue;
                }

                const weight = Number(keyMatch[1]);
                weightedSum += count * weight;
                totalCount += count;
                usedWeightedKey = true;
            }

            if (usedWeightedKey) {
                return totalCount === 0 ? null : weightedSum / totalCount;
            }
        }

        const output = {};
        for (const [key, value] of entries) {
            output[key] = weightedAverageNested(value);
        }

        return output;
    };

    for (const [teamNumber, team] of Object.entries(dataset.teams)) {
        const tmps = dataset.tmps.filter(x => x.robotNumber == teamNumber);
        let mergedCounts = null;

        for (const tmp of tmps) {
            const value = getPath(tmp, options.path);
            if (value === undefined || value === null) {
                continue;
            }

            mergedCounts = mergeCounts(mergedCounts, value);
        }

        setPath(team, outputPath, mergedCounts === null ? null : weightedAverageNested(mergedCounts));
    }

    return dataset;
})
__/TEAM__