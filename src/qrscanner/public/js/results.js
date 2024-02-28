function onScanSuccess(qrCodeMessage) {
    document.getElementById('result').innerHTML = '<p>' + qrCodeMessage + '</p>';
}

function onScanError(errorMessage) {

}

var html5QrcodeScanner = new Html5QrcodeScanner(
    "reader", { fps: 30, qrbox: 250 });
html5QrcodeScanner.render(onScanSuccess, onScanError);