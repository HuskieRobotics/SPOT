async function executeOfflinePipeline(debug) {
    let tmps = await fetch("./api/rawDataset").then(res => res.json());
    const storage = localStorage.getItem('teamMatchPerformances');
    if (storage) {
        const qrcodeTmps = JSON.parse(localStorage.getItem('teamMatchPerformances')).map((tmp) => JSON.parse(tmp));
        tmps = [...tmps, ...qrcodeTmps];
    }

    const teams = [];

    for (const tmp of tmps) {
        teams[tmp.robotNumber] = {};
    }

    let dataset = { tmps, teams };

    const manual = await fetch('./api/manual').then(res => res.json());
    const pipelineConfig = await fetch("../../../config/analysis-pipeline.json").then(res => res.json());
    const transformers = await getTransformers();

    for (let tfConfig of pipelineConfig) {
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

    return dataset;
}