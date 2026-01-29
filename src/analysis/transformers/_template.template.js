async function getTransformers() {
    const [matchScoutingConfig, matchScouting5x12Config] = await Promise.all([
        fetch("../../../config/match-scouting.json").then((res) => res.json()),
        fetch("../../../config/match-scouting-5x12.json").then((res) => res.json()).catch(() => null),
    ]);

    const allLayers = []
        .concat(matchScoutingConfig?.layout?.layers || [])
        .concat(matchScouting5x12Config?.layout?.layers || []);

    const actionIds = allLayers.flat().reduce((acc, button) => (acc.includes(button.id) ? acc : acc.concat(button.id)), []); // unique actionIds from all layers

    return {
        __TRANSFORMERS__
    };
}