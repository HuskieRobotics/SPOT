executables["clearHighlight"] = {
  execute(button) {
    button.__hadHighlight = button.element.classList.contains("highlight");
    button.element.classList.remove("highlight");
  },
  reverse(button) {
    if (button.__hadHighlight) {
      button.element.classList.add("highlight");
    }
    delete button.__hadHighlight;
  },
};
