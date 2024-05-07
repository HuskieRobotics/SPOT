// the toggle switch for demo
document.addEventListener('DOMContentLoaded', function () {
    const toggleSwitch = document.getElementById('DEMO');
    toggleSwitch.value = 0;

    toggleSwitch.addEventListener('change', function () {
        if (this.checked) {
            toggleSwitch.value = 1;
            console.log(toggleSwitch.value);
            console.log("Switch is ON");
        } else {
            toggleSwitch.value = 0;
            console.log(toggleSwitch.value);
            console.log("Switch is OFF");
        }
    });
});
