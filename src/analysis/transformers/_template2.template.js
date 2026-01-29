const axios = require("axios");
const { DataTransformer } = require("../public/js/DataTransformer.js");
const { getPath } = require("../public/js/util.js");
const { setPath } = require("../public/js/util.js");

async function getTransformers() {
    const matchScoutingConfig = await axios.get("/config/match-scouting-5x12.json").then((res) => res.data);
    const actionIds = matchScoutingConfig.layout.layers.flat().reduce((acc,button) => acc.includes(button.id) ? acc : acc.concat(button.id), []); //get list of unique actionIds from the buttons in config.json

    return {
        __TRANSFORMERS__
    };
}

module.exports = { getTransformers };