class DataTransformer {
  name;
  execFunc;
  /**
   * @param {String} name
   * @param {execFunc} execFunc
   */
  constructor(name, execFunc) {
    if (!name) throw new Error("DataTransformers must have a name!");
    this.name = name;
    this.execFunc = execFunc;
  }
  get name() {
    return this.name;
  }
  /**
   * executes the transformer on a Dataset after making all properties currently in the Dataset read only. This ensures that DataTransformers do not overwrite each other's outputs.
   * @param {Dataset} dataset
   * @param {String} outputPath
   * @param {Object} options
   * @returns {Dataset} the augmented dataset
   */
  execute(dataset, outputPath, options) {
    return this.execFunc(dataset, outputPath, options);
  }
}

class Dataset {
  tmps;
  teams;
  /**
   * @param {*} teamMatchPerformances
   */
  constructor(teamMatchPerformances) {
    this.tmps = [];
    this.teams = {};
    for (let tmp of teamMatchPerformances) {
      //create an empty team object for each team
      this.tmps.push(tmp);
      if (!Object.keys(this.teams).includes(tmp.robotNumber)) {
        this.teams[tmp.robotNumber] = {};
      }
    }
  }
}
