const fs = require('fs');
const { readQRCode } = require('./src/qrscanner/qr-reader.js');
const { sample } = require('simple-statistics');

jest.mock('jimp');
jest.mock('qrcode-reader');

describe('QR code scanner', () => {
  test('reads QR code correctly', async () => {
    const filePath = 'path/to/validQRCode.png';
    // Mock fs.readFileSync
    fs.readFileSync.mockReturnValueOnce(Buffer.from('src/qrscanner/temp/qrcode.png'));
    const result = await readQRCode(filePath);
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
    sampleData = sampleData.stringify();
    // Adjust the expectation based on your QR code content
    expect(result).toEqual(sampleData);
  });
  // Reset the mock after each test
  afterEach(() => {
    jest.resetAllMocks();
  });
});