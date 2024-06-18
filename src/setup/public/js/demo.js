// the toggle switch for demo

document.addEventListener("DOMContentLoaded", function () {
  const toggleSwitch = document.getElementById("DEMO");
  toggleSwitch.value = false;

  toggleSwitch.addEventListener("change", function () {
    if (this.checked) {
      toggleSwitch.value = true;
      console.log(toggleSwitch.value);
      console.log("Switch is ON");
    } else {
      toggleSwitch.value = false;
      console.log(toggleSwitch.value);
      console.log("Switch is OFF");
    }
  });
});
