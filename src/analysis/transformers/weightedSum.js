/**
 * 
 * @type {DataTransformer}
 * @param options.weightedPaths {Object} {"pathString": weight} (eg. {"counts.upperHub": 2} ) 
 */
__TMP__
new DataTransformer("weightedSum", (dataset, outputPath, options) => {
    for (let tmp of dataset.tmps) {
        let sum = 0;
        for (let [pathString,weight] of Object.entries(options.weightedPaths)) {
            sum += getPath(tmp, pathString, 0) * weight;
        }
        setPath(tmp,outputPath,sum);
    }
    return dataset;
})
__/TMP__