/**
 * @type {DataTransformer}
 * Recursively averages all numeric values in the path of all the tmps for an object.
 * @param options.path {String} a numerical path in a tmp to be averaged, or a path containing an object with numerical paths to be averaged
 */
__TEAM__
new DataTransformer("deepAverage", (dataset, outputPath, options) => {
  options = Object.assign({ path: "" }, options);

  for (let teamNum in dataset.teams) {
    const team = dataset.teams[teamNum];
    const tmps = (dataset.tmps || []).filter(tmp => tmp.robotNumber == teamNum);

    const addNested = (a, b) => {
      if (b === undefined) return a;
      if (a === undefined) return b;
      if (typeof a === 'number' && typeof b === 'number') return a + b;
      if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
        const result = {};
        for (let key in a) {
          result[key] = addNested(a[key], b[key]);
        }
        for (let key in b) {
          if (!(key in a)) result[key] = b[key];
        }
        return result;
      }
      return a;
    };
    
    // Recursively sum nested objects
    const sumNested = (obj) => {
      if (typeof obj === 'number') return obj;
      if (Array.isArray(obj)) {
        if (!obj.every(value => typeof value === 'number')) return undefined;
        return obj.reduce((a, v) => a + v, 0);
      }
      if (typeof obj === 'object' && obj !== null) {
        const result = {};
        for (let key in obj) {
          const summed = sumNested(obj[key]);
          if (summed !== undefined) result[key] = summed;
        }
        return Object.keys(result).length > 0 ? result : undefined;
      }
      return undefined;
    };

    // Recursively divide by count
    const divideNested = (obj, count) => {
      if (typeof obj === 'number') return obj / count;
      if (obj === undefined) return undefined;
      if (typeof obj === 'object' && obj !== null) {
        const result = {};
        for (let key in obj) {
          const divided = divideNested(obj[key], count);
          if (divided !== undefined) result[key] = divided;
        }
        return Object.keys(result).length > 0 ? result : undefined;
      }
      return obj;
    }; 

    let sum = null;
    let count;
    
    for (let tmp of tmps) {
      const pathData = getPath(tmp, options.path);
      if (pathData !== undefined) {
        const summedValue = sumNested(pathData);
        if (summedValue === undefined) continue;

        if (sum === null) {
          sum = summedValue;
        } else {
          sum = addNested(sum, summedValue);
        }

        const tmpsWithThisPath = tmps.filter((tmp) => getPath(tmp, options.path) !== null)
        //count = tmpsWithThisPath.length;
        count = 1;
      }
    }

    const avg = count > 0 ? divideNested(sum, count) : null;
    setPath(team, outputPath, avg);
  }

  return dataset;
})
__/TEAM__