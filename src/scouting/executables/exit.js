executables["exit"] = {
  execute(button, layers, args) {
    //when the button is pressed, do this
    localStorage.setItem("inMatch", "false");
    location.reload();
  },
  reverse(button, layers, args) {
    //when the button is undone, do this. This should undo EVERYTHING done by execute
  },
};
