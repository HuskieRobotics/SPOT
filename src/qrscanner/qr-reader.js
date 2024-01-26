const jimp = require('jimp');
const fs = require('fs');
const qrcodeReader = require('qrcode-reader');

/**
 * Returns a promise that later resolves to the data embedded in the QR
 * code, or to an error during the reading process
 * @param {string} filePath The file path of the qr code image
 * @returns A promise of the embedded data
 */
async function readQRCode(filePath) {
    const buffer = fs.readFileSync(filePath);

    return new Promise(async (resolve, reject) => {
        await jimp.read(await buffer, (err, image) => {
            if (err) {
                reject(err);
            }

            const qrCodeInstance = new qrcodeReader();

            qrCodeInstance.callback = function(err, value) {
                if (err) {
                    reject(err);
                }

                resolve(value.result);
            }

            qrCodeInstance.decode(image.bitmap);
        });
    });
}

module.exports = {
    readQRCode,
}