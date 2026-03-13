// the toggle switch for demo

document.addEventListener("DOMContentLoaded", function () {
  const toggleSwitch = document.getElementById("DEMO");
  toggleSwitch.value = false;

  toggleSwitch.addEventListener("change", function () {
    if (this.checked) {
      toggleSwitch.value = true;
    } else {
      toggleSwitch.value = false;
    }
  });
});
