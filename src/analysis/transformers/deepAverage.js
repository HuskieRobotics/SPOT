/**
 * @type {DataTransformer}
 * Recursively averages all numeric leaf values in a nested object structure
 */
__TEAM__
new DataTransformer("deepAverage", (dataset, outputPath, options) => {
  options = Object.assign({ path: "" }, options);

  for (let teamNum in dataset.teams) {
    const team = dataset.teams[teamNum];
    const tmps = team.tmps;
    
    // Recursively sum nested objects
    const sumNested = (obj) => {
      if (typeof obj === 'number') return obj;
      if (Array.isArray(obj)) return obj.reduce((a, v) => a + sumNested(v), 0);
      if (typeof obj === 'object' && obj !== null) {
        const result = {};
        for (let key in obj) {
          result[key] = sumNested(obj[key]);
        }
        return result;
      }
      return 0;
    };

    // Recursively divide by count
    const divideNested = (obj, count) => {
      if (typeof obj === 'number') return obj / count;
      if (typeof obj === 'object' && obj !== null) {
        const result = {};
        for (let key in obj) {
          result[key] = divideNested(obj[key], count);
        }
        return result;
      }
      return obj;
    };

    let sum = null;
    let count = 0;

    for (let tmp of tmps) {
      const value = getPath(tmp, options.path);
      if (value !== undefined) {
        if (sum === null) {
          sum = sumNested(value);
        } else {
          const addNested = (a, b) => {
            if (typeof a === 'number' && typeof b === 'number') return a + b;
            if (typeof a === 'object' && typeof b === 'object') {
              const result = {};
              for (let key in a) {
                result[key] = addNested(a[key], b[key] || 0);
              }
              for (let key in b) {
                if (!(key in a)) result[key] = b[key];
              }
              return result;
            }
            return a;
          };
          sum = addNested(sum, sumNested(value));
        }
        count++;
      }
    }

    const avg = count > 0 ? divideNested(sum, count) : null;
    setPath(team, outputPath, avg);
  }

  return dataset;
});
__/TEAM__