const { generateQRCode } = require('./qr-generator');
const { readQRCode } = require('./qr-reader');

const filePath = __dirname + '\\temp\\qrcode.png';
const sampleData = {
    one: 'ABC',
    two: 'abc',
    three: 'AdOQ4',
    four: 5,
    six: true,
    seven: {
        sevenOne: true,
        sevenTwo: 'xyz',
    },
    eight: 1.1,
}

generateQRCode(sampleData, filePath);

async function help() {
    const data = await readQRCode(filePath);
    console.log(`Returned Data: ${data}`);
}

help();