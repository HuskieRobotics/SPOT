// the toggle switch for demo
document.addEventListener('DOMContentLoaded', function () {
    const toggleSwitch = document.getElementById('toggleSwitch').querySelector('input[type="checkbox"]');

    toggleSwitch.addEventListener('change', function () {
        if (this.checked) {
            toggleSwitch.value = "true";
            console.log(toggleSwitch.value);
            console.log("Switch is ON");
        } else {
            toggleSwitch.value = "false";
            console.log(toggleSwitch.value);
            console.log("Switch is OFF");
        }
    });
});
