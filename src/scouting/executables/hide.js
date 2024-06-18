/**
 * Hides the button on execute
 */
executables["hide"] = {
  execute(button) {
    //when the button is pressed, do this
    button.element.style.display = "none";
  },
  reverse(button) {
    //when the button is undone, do this. This should undo EVERYTHING done by execute
    button.element.style.display = "flex";
  },
};
