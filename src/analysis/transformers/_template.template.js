async function getTransformers() {
    const matchScoutingConfig = await fetch("../../../config/match-scouting.json").then(res => res.json());
    const actionIds = matchScoutingConfig.layout.layers.flat().reduce((acc,button) => acc.includes(button.id) ? acc : acc.concat(button.id), []); //get list of unique actionIds from the buttons in config.json

    return {
        __TRANSFORMERS__
    };
}