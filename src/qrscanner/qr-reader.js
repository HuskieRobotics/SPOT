const jimp = require('jimp');
const fs = require('fs');
const qrcodeReader = require('qrcode-reader');

function readQRCode(filePath) {
    const buffer = fs.readFileSync(filePath);

    jimp.read(buffer, function(err, image) {
        if (err) {
            console.error(err);
        }

        const qrCodeInstance = new qrcodeReader();

        qrCodeInstance.callback = function(err, value) {
            if (err) {
                console.error(err);
                return undefined;
            }

            return value.result;
        }

        
        qrCodeInstance.decode(image.bitmap);
    });
}

module.exports = {
    readQRCode,
}