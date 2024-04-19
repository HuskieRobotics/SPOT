async function execute(dataset) {
    /* get tmps from database */
    // dataset = new Dataset((await TeamMatchPerformance.find({eventNumber: config.EVENT_NUMBER})).map((o) => o.toObject()));
    // console.log(dataset);
    // console.log('------');

    const pipelineConfig = await fetch('../../config/analysis-pipeline.json');
    console.log(pipelineConfig);
    
    /*
    for (let tfConfig of pipelineConfig) {
        if (debug) console.log(`running ${tfConfig.name} - ${JSON.stringify(tfConfig.options)}`)
        dataset = transformers[tfConfig.type][tfConfig.name].execute(dataset, tfConfig.outputPath, tfConfig.options);
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
    */
}

execute();