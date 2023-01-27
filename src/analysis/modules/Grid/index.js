class Grid {
  container;
  moduleConfig;

    constructor(moduleConfig) {
        this.moduleConfig = moduleConfig
        this.container = createDOMElement("div", "container grid")
    }

    formatData(teams, dataset) {
		  const data = {};
      data.title = this.moduleConfig.name;
      data.cols = this.moduleConfig.options.cols;
      data.rows = this.moduleConfig.options.rows;
      let mapped = this.moduleConfig.options.cells.map((cell)=>{
        let newObj = {
          x:cell.x,
          y:cell.y,
          data:getPath(dataset.teams[teams[0]],cell.path,'/').toFixed(this.moduleConfig.options.decimals),
          hex:cell.hex,
        }
        return newObj
      })
      data.cells = mapped
      return data
    }
/*

*/
    setData(data) {
      var title = createDOMElement('div','header');
      title.innerHTML = data.title
      this.container.appendChild(title)
      var gridContainer = createDOMElement('div','table')
		  gridContainer.style.display = 'grid';
      gridContainer.style.gridTemplateRows = `repeat(${data.rows},1fr)`;
      gridContainer.style.gridTemplateColumns = `repeat(${data.cols},1fr)`;
      this.container.appendChild(gridContainer)
      var slope = 225/(this.moduleConfig.options.max - this.moduleConfig.options.min)
      
      for(let cell of data.cells){
        var opacity = Math.min(30 + slope * (cell.data-this.moduleConfig.options.min),255)
        let newHex = cell.hex + Math.floor(opacity).toString(16)
        var cellDiv = createDOMElement('div','cell')
        cellDiv.style.backgroundColor = newHex;
        cellDiv.innerHTML = cell.data;
        cellDiv.style.gridArea = `${cell.y}/${cell.x}/${cell.y+1}/${cell.x+1}`
        gridContainer.appendChild(cellDiv)
      }
    }
}