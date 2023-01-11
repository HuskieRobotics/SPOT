class Divider {
    container;
	title;
    moduleConfig;

    constructor(moduleConfig) {
        this.moduleConfig = moduleConfig
        this.container = createDOMElement("div", "container divider")
		this.title = createDOMElement("div", "title")
		this.container.appendChild(this.title)
    }

    async formatData() {
		
    }

    async setData() {
		this.title.innerText = this.moduleConfig.name
    }
}