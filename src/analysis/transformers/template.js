const {DataTransformer} = require("../DataTransformer");

module.exports = {
    /**
     * @type {DataTransformer}
     * @param options.example {String} example parameter description
     */
    tmp: new DataTransformer("name", (dataset, outputPath, options) => {
        return dataset;
    }),

    /**
     * @type {DataTransformer}
     * @param options.example {String} example parameter description
     */
    team: new DataTransformer("name", (dataset, outputPath, options) => {
        return dataset;
    })
}