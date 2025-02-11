/**
 * Leave the match
 */
executables["leave"] = {
  execute(button) {
    //when the button is pressed, do this
    localStorage.removeItem("inMatch");
    location.reload();
  },
  reverse(button) {
    //when the button is undone, do this. This should undo EVERYTHING done by execute
    // no. This is a one way street
  },
};
