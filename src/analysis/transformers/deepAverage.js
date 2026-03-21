/**
 * @type {DataTransformer}
 * Recursively averages all numeric values in the path of all the tmps for an object.
 * @param options.path {String} a numerical path in a tmp to be averaged, or a path containing an object with numerical paths to be averaged
 */
__TEAM__
new DataTransformer("deepAverage", (dataset, outputPath, options) => {
  options = Object.assign({ path: "" }, options);
  const tmpsByTeam = {};

  // Build a one-time lookup table so each team can access only its own tmps.
  for (const tmp of (dataset.tmps || [])) {
    const robotKey = String(tmp.robotNumber);
    if (!tmpsByTeam[robotKey]) tmpsByTeam[robotKey] = [];
    tmpsByTeam[robotKey].push(tmp);
  }

  // Process one team at a time and write the averaged nested output to that team object.
  for (let teamNum in dataset.teams) {
    const team = dataset.teams[teamNum];
    // Only use tmps from the current team when computing this team's average tree.
    const tmps = tmpsByTeam[String(teamNum)] || [];

    // Mirror trees that store per-leaf totals and per-leaf sample counts.
    // Example leaf: AZone.StopShooting
    const sums = {};
    const counts = {};
    const leafShape = {};

    // Marks a leaf path as expected in the output, even if it later has no non-zero samples.
    const addLeafShape = (pathSegments) => {
      let node = leafShape;
      for (let i = 0; i < pathSegments.length; i++) {
        const segment = pathSegments[i];
        const isLeaf = i === pathSegments.length - 1;

        if (isLeaf) {
          node[segment] = true;
        } else {
          if (node[segment] === undefined || typeof node[segment] !== "object" || node[segment] === null) {
            node[segment] = {};
          }
          node = node[segment];
        }
      }
    };

    // Adds one numeric value into the nested sum/count trees at a specific leaf path.
    const addPathValue = (pathSegments, value) => {
      let sumNode = sums;
      let countNode = counts;

      // Walk each segment in the leaf path and create missing intermediate objects as needed.
      for (let i = 0; i < pathSegments.length; i++) {
        const segment = pathSegments[i];
        const isLeaf = i === pathSegments.length - 1;

        if (isLeaf) {
          // Final segment in the path: update the running total and sample count for this exact metric.
          sumNode[segment] = (sumNode[segment] || 0) + value;
          countNode[segment] = (countNode[segment] || 0) + 1;
        } else {
          // Intermediate segment in the path: ensure branch objects exist before descending deeper.
          if (sumNode[segment] === undefined || typeof sumNode[segment] !== "object" || sumNode[segment] === null) {
            sumNode[segment] = {};
          }
          if (countNode[segment] === undefined || typeof countNode[segment] !== "object" || countNode[segment] === null) {
            countNode[segment] = {};
          }
          // Move both cursors to the child branch so the next path segment is processed at the correct depth.
          sumNode = sumNode[segment];
          countNode = countNode[segment];
        }
      }
    };

    // Walk a nested object and collect all finite numeric leaves.
    // Each leaf keeps its own denominator (count), so sparse paths are handled correctly.
    const collectNumericLeaves = (value, pathSegments) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        // Track shape from all numeric leaves, including zeros, so output paths always exist.
        addLeafShape(pathSegments);
        // Treat 0 as missing data for averaging so it does not contribute to the denominator.
        if (value === 0) return; 
        addPathValue(pathSegments, value);
        return;
      }

      if (value && typeof value === "object") {
        // Visit each child key depth-first while reusing the same path array to avoid extra allocations.
        for (const key of Object.keys(value)) {
          pathSegments.push(key);
          collectNumericLeaves(value[key], pathSegments);
          pathSegments.pop();
        }
      }
    };

    // Fill every expected leaf path; if an averaged value is missing, emit 0 for that leaf.
    const fillMissingLeaves = (shapeNode, avgNode) => {
      if (shapeNode === true) {
        return avgNode === undefined ? 0 : avgNode;
      }

      const result = {};
      for (const key of Object.keys(shapeNode)) {
        const childAvgNode = avgNode && typeof avgNode === "object" ? avgNode[key] : undefined;
        result[key] = fillMissingLeaves(shapeNode[key], childAvgNode);
      }
      return result;
    };

    // Rebuild the output object by dividing sum/count at each numeric leaf.
    // Branches with no valid numeric descendants are omitted.
    const computeAverageTree = (sumNode, countNode) => {
      if (typeof sumNode === "number" && typeof countNode === "number") {
        return countNode > 0 ? sumNode / countNode : undefined;
      }

      if (!sumNode || typeof sumNode !== "object") return undefined;

      const result = {};
      // Recurse through every branch in the sum tree and compute a matching averaged branch.
      for (const key of Object.keys(sumNode)) {
        const avgValue = computeAverageTree(sumNode[key], countNode ? countNode[key] : undefined);
        if (avgValue !== undefined) result[key] = avgValue;
      }

      return Object.keys(result).length > 0 ? result : undefined;
    };

    // Read the configured path from each tmp and collect all numeric leaves into sums/counts.
    // Each tmp contributes only to the leaf paths it actually contains.
    for (const tmp of tmps) {
      const pathData = getPath(tmp, options.path);
      if (pathData !== undefined && pathData !== null) {
        collectNumericLeaves(pathData, []);
      }
    }

    // If no numeric data exists for this team/path, store null to indicate no average.
    const avgTree = computeAverageTree(sums, counts);
    const hasShape = Object.keys(leafShape).length > 0;
    const avg = hasShape ? fillMissingLeaves(leafShape, avgTree) : null;
    setPath(team, outputPath, avg);
  }

  return dataset;
})
__/TEAM__