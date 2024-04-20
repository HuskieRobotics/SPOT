async function executeOfflinePipeline(dataset, debug) {
    /* get tmps from database */
    // dataset = new Dataset((await TeamMatchPerformance.find({eventNumber: config.EVENT_NUMBER})).map((o) => o.toObject()));
    // console.log(dataset);
    // console.log('------');

    const matchScoutingConfig = await fetch('../../config/match-scouting.json').then((res) => res.json());
    const actionIds = matchScoutingConfig.layout.layers.flat().reduce((acc,button) => acc.includes(button.id) ? acc : acc.concat(button.id), []);

    const pipelineConfig = await fetch('../../config/analysis-pipeline.json').then((res) => res.json());
    const manual = await fetch('./api/manual').then((res) => res.json());
    const transformers = await fetch('./api/transformers').then((res) => res.json());
    
    for (let tfConfig of pipelineConfig) {
        if (debug) console.log(`running ${tfConfig.name} - ${JSON.stringify(tfConfig.options)}`)
        const func = eval(transformers[tfConfig.type][tfConfig.name].execute);
        dataset = func(dataset, tfConfig.outputPath, tfConfig.options);
    }

	dataset.tmps = dataset.tmps.concat(manual.tmps.map(tmp => ({
		...tmp,
		manual: true
	})))
	for (const [path, teamData] of Object.entries(manual.teams)) {
		for (const [team, value] of Object.entries(teamData)) {
			if (team in dataset.teams) {
				setPath(dataset.teams[team], "manual." + path, value)
			} else {
				dataset.teams[team] = {}
				setPath(dataset.teams[team], "manual." + path, value)
			}

			
		}
	}

    if (debug) console.log("complete!")

    return dataset
}

// executeOfflinePipeline();