const axios = require("axios");
const { DataTransformer } = require("../public/js/DataTransformer.js");
const { getPath } = require("../public/js/util.js");
const { setPath } = require("../public/js/util.js");

async function getTransformers() {
    const [matchScoutingConfig, matchScouting5x12Config] = await Promise.all([
        axios.get("/config/match-scouting.json").then((res) => res.data),
        axios.get("/config/match-scouting-5x12.json").then((res) => res.data).catch(() => null),
    ]);

    const allLayers = []
        .concat(matchScoutingConfig?.layout?.layers || [])
        .concat(matchScouting5x12Config?.layout?.layers || []);

    const actionIds = allLayers.flat().reduce((acc, button) => (acc.includes(button.id) ? acc : acc.concat(button.id)), []); // unique actionIds from all layers

    return {
        __TRANSFORMERS__
    };
}

module.exports = { getTransformers };