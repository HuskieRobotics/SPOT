/**
 * 
 * @type {DataTransformer}
 * @param options.weightedPaths {Object} {"pathString": weight}
 */
__TMP__
new DataTransformer("weightedAverage", (dataset, outputPath, options) => {
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