/*
* This file needs to be moved to scouting (wherever the QR code will be generated in there), 
* but for now its staying in admin for testing purposes
*/
const qrcode = require('qrcode');

/**
 * 
 * @param {object} data 
 * @param {string} filePath 
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
