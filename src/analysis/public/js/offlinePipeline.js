async function executeOfflinePipeline(debug) {
    console.log('executing');

    let tmps = await fetch("./api/rawDataset").then(res => res.json());
    const storage = localStorage.getItem('teamMatchPerformances');
    if (storage) {
        const qrcodeTmps = JSON.parse(localStorage.getItem('teamMatchPerformances')).map((tmp) => JSON.parse(tmp));
        tmps = [...tmps, ...qrcodeTmps];
    }

    console.log(tmps);

    const teams = [];

    for (const tmp of tmps) {
        teams[tmp.robotNumber] = {};
    }

    let dataset = { tmps, teams }

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