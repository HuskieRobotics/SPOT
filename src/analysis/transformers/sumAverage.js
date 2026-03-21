/**
 * Computes a weighted average from multiple rating averages, where each group's weight is its total rating count.
 * @type {DataTransformer}
 * @param options.groups {Object[]} [{averagePath: "scores.phaseRating", countPaths: ["counts.phaseRating1", ...]}]
 */
__TMP__
new DataTransformer("sumAverage", (dataset, outputPath, options) => {
    function deriveCountPaths(entity, averagePath) {
        const prefix = "scores.";
        if (!averagePath || !averagePath.startsWith(prefix)) {
            throw new Error(`sumAverage could not derive countPaths from ${averagePath}`);
        }

        // Example: scores.teleopTransitionCollectingRating -> teleopTransitionCollectingRating
        const base = averagePath.slice(prefix.length);
        if (!base.endsWith("Rating")) {
            throw new Error(`sumAverage could not derive countPaths from ${averagePath}`);
        }

        // We infer valid count keys from existing counts data so new metrics work automatically.
        const counts = getPath(entity, "counts", {});
        const ratingRegex = /^(.*)Rating(.+?)(\d+)$/;
        const matches = [];

        for (let key of Object.keys(counts)) {
            const match = key.match(ratingRegex);
            if (!match) continue;

            const phase = match[1];
            const metric = match[2];
            const ratingNum = Number(match[3]);

            // Convert count key form (phaseRatingMetricN) to average form (phaseMetricRating).
            const normalized = `${phase}${metric}Rating`;
            if (normalized !== base) continue;

            matches.push({ ratingNum, path: `counts.${key}` });
        }

        if (matches.length === 0) {
            throw new Error(`sumAverage could not derive countPaths from ${averagePath}`);
        }

        // Keep path order stable: Rating1, Rating2, Rating3, ...
        return matches
            .sort((a, b) => a.ratingNum - b.ratingNum)
            .map((match) => match.path);
    }

    if (!options || !Array.isArray(options.groups)) {
        throw new Error("sumAverage requires options.groups")
    }

    for (let tmp of dataset.tmps) {
        let weightedSum = 0;
        let totalCount = 0;

        for (let group of options.groups) {
            const countPaths = group.countPaths || deriveCountPaths(tmp, group.averagePath);
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
 * Computes a weighted average from multiple rating averages, where each group's weight is its total rating count.
 * @type {DataTransformer}
 * @param options.groups {Object[]} [{averagePath: "scores.phaseRating", countPaths: ["counts.phaseRating1", ...]}]
 */
__TEAM__
new DataTransformer("sumAverage", (dataset, outputPath, options) => {
    function deriveCountPaths(entity, averagePath) {
        const prefix = "scores.";
        if (!averagePath || !averagePath.startsWith(prefix)) {
            throw new Error(`sumAverage could not derive countPaths from ${averagePath}`);
        }

        // Example: scores.teleopTransitionCollectingRating -> teleopTransitionCollectingRating
        const base = averagePath.slice(prefix.length);
        if (!base.endsWith("Rating")) {
            throw new Error(`sumAverage could not derive countPaths from ${averagePath}`);
        }

        // We infer valid count keys from existing counts data so new metrics work automatically.
        const counts = getPath(entity, "counts", {});
        const ratingRegex = /^(.*)Rating(.+?)(\d+)$/;
        const matches = [];

        for (let key of Object.keys(counts)) {
            const match = key.match(ratingRegex);
            if (!match) continue;

            const phase = match[1];
            const metric = match[2];
            const ratingNum = Number(match[3]);

            // Convert count key form (phaseRatingMetricN) to average form (phaseMetricRating).
            const normalized = `${phase}${metric}Rating`;
            if (normalized !== base) continue;

            matches.push({ ratingNum, path: `counts.${key}` });
        }

        if (matches.length === 0) {
            throw new Error(`sumAverage could not derive countPaths from ${averagePath}`);
        }

        // Keep path order stable: Rating1, Rating2, Rating3, ...
        return matches
            .sort((a, b) => a.ratingNum - b.ratingNum)
            .map((match) => match.path);
    }

    if (!options || !Array.isArray(options.groups)) {
        throw new Error("sumAverage requires options.groups")
    }

    for (let [teamNumber, team] of Object.entries(dataset.teams)) {
        let weightedSum = 0;
        let totalCount = 0;

        for (let group of options.groups) {
            const countPaths = group.countPaths || deriveCountPaths(team, group.averagePath);
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
