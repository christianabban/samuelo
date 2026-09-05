// Generates a high-resolution QR code PNG for printing on table cards.
//
// Usage (after you've deployed and know your real Netlify URL):
//   node scripts/generate-qr.js https://your-site-name.netlify.app
//
// The output is saved to public/qr-print.png — a 1000x1000px image, safe to
// print on cards, signage, or anything else.

const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

async function main() {
  const baseUrl = process.argv[2];
  if (!baseUrl) {
    console.error('Usage: node scripts/generate-qr.js https://your-site-name.netlify.app');
    process.exit(1);
  }
  const albumId = getAlbumId();
  const uploadUrl = `${baseUrl.replace(/\/$/, '')}/upload.html?album=${encodeURIComponent(albumId)}`;

  const outPath = path.join(__dirname, '..', 'public', 'qr-print.png');
  await QRCode.toFile(outPath, uploadUrl, {
    width: 1000,
    margin: 2,
    color: { dark: '#1d1d1f', light: '#ffffff' }
  });

  console.log('QR code saved to public/qr-print.png');
  console.log('It points guests to:', uploadUrl);
}

function getAlbumId() {
  // public/config.js sets window.KEPT_CONFIG in the browser; in Node we read
  // the file as text and pull the albumId out rather than requiring it.
  const raw = fs.readFileSync(path.join(__dirname, '..', 'public', 'config.js'), 'utf-8');
  const match = raw.match(/albumId:\s*["']([^"']+)["']/);
  return match ? match[1] : 'wedding';
}

main().catch(err => {
  console.error('Failed to generate QR code:', err.message);
  process.exit(1);
});
