const pipelineConfig = require("../../config/analysis-pipeline.json");
const fs = require("fs");
const { TeamMatchPerformance } = require("../lib/db");
const { Dataset } = require("./DataTransformer");


/* load transformers */
const transformers = {
    tmp: {},
    team: {}
}

for (let executableFile of fs.readdirSync(__dirname + "/transformers")) {
    console.log(`attempting to load transformer from ${__dirname + "/transformers/" + executableFile}`)
    let transformer = require("./transformers/" + executableFile);

    if ("tmp" in transformer) { //the transformer supports teamMatchPerformances
        console.log(`${transformer.tmp.name}.tmp - detected`)
        if (transformer.tmp.name in transformers.tmp) 
            throw new Error(`${transformers.tmp.name}.tmp - transformer name duplicated! Transformer names must be unique.\nOther transformers loaded: [${Object.keys(transformers.tmp)}]`);
        transformers.tmp[transformer.tmp.name] = transformer.tmp;
    }

    if ("team" in transformer) { //the transformer supports teams
        console.log(`${transformer.team.name}.team - detected`)
        if (transformer.team.name in transformers.team) 
            throw new Error(`${transformers.team.name} - transformer name duplicated! Transformer names must be unique.\nOther transformers loaded: [${Object.keys(transformers.tmp)}]`);
        transformers.team[transformer.team.name] = transformer.team;
    }
}
console.log("loaded all transformers!");
console.log(transformers);


async function execute(dataset,debug=false) {
    /* get tmps from database */
    dataset = new Dataset((await TeamMatchPerformance.find()).map((o) => o.toObject()));
    
    for (let tfConfig of pipelineConfig) {
        console.log(`running ${tfConfig.name} - ${JSON.stringify(tfConfig.options)}`)
        dataset = transformers[tfConfig.type][tfConfig.name].execute(dataset, tfConfig.outputPath, tfConfig.options);
    }
    console.log("complete!")

    return dataset
}

module.exports = execute

// (async () => console.log((await execute()).teams["3061"] ) )();