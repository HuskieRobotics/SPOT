executables["climbHighlight"] = {
  execute(button, layers, args) {
    const otherClimbButtons = layers
      .flat()
      .filter((x) => x.executables.find((e) => e.type == "climbHighlight"));
    console.log(otherClimbButtons);
    for (let otherButton of otherClimbButtons) {
      otherButton.element.classList.remove("highlight");
    }
    button.element.classList.add("highlight");
  },
  async reverse(button, layers, args) {
    //find the current climb position by traversing the action queue backwards
    let highlightableButtons = {};
    for (let layerButton of layers.flat()) {
      if (layerButton.executables.find((e) => e.type == "climbHighlight"))
        //if its highlightable
        highlightableButtons[layerButton.id] = layerButton; //add its id
    }
    let oldHighlightId = [...actionQueue]
      .reverse()
      .find((x) => x && x.id in highlightableButtons).id;

    //re add highlights
    button.element.classList.remove("highlight");
    highlightableButtons[oldHighlightId].element.classList.add("highlight");
  },
};
