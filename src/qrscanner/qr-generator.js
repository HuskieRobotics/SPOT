/*
* This file needs to be moved to scouting (wherever the QR code will be generated in there), 
* but for now its staying in admin for testing purposes
*/
const qrcode = require('qrcode');

/**
 * Generates a QR code with the given data
 * at the specified file path
 * @param {object} data The data to encode
 * @param {string} filePath The path to write the qr code image to
 */
function generateQRCode(data, filePath) {
    qrcode.toFile(filePath, JSON.stringify(data), {
        errorCorrectionLevel: 'H',
    }, function(err) {
        if (err) throw err;
    })
}

module.exports = {
    generateQRCode,
}
