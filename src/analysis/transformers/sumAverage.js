/**
 * @type {DataTransformer}
 * @param options.groups {Object[]} [{averagePath: "scores.phaseRating", countPaths: ["counts.phaseRating1", ...]}]
 */
__TMP__
new DataTransformer("sumAverage", (dataset, outputPath, options) => {
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

/**
 * @type {DataTransformer}
 * @param options.groups {Object[]} [{averagePath: "scores.phaseRating", countPaths: ["counts.phaseRating1", ...]}]
 */
__TEAM__
new DataTransformer("sumAverage", (dataset, outputPath, options) => {
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

    for (let [teamNumber, team] of Object.entries(dataset.teams)) {
        let weightedSum = 0;
        let totalCount = 0;

        for (let group of options.groups) {
            const countPaths = group.countPaths || deriveCountPaths(group.averagePath);
            const groupCount = countPaths.reduce((acc, path) => {
                return acc + getPath(team, path, 0);
            }, 0);

            if (groupCount === 0) continue;

            const avg = getPath(team, group.averagePath, null);
            if (avg === null || typeof avg === "undefined") continue;

            weightedSum += avg * groupCount;
            totalCount += groupCount;
        }

        const average = totalCount === 0 ? null : weightedSum / totalCount;
        setPath(team, outputPath, average);
    }

    return dataset;
})
__/TEAM__
