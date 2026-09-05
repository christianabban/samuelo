// Netlify Function: receives guest uploads and stores them in Netlify Blobs.
//
// Netlify Blobs is built-in file storage — no separate S3/R2 account needed.
// Each uploaded file becomes one blob, keyed by album + filename. A second,
// tiny JSON blob per album ("manifest") tracks guest names and upload order,
// since Blobs itself is just a key/value store, not a database.
//
// Endpoint (after deploy): POST /.netlify/functions/upload

const { getStore } = require('@netlify/blobs');
const busboy = require('busboy');

const MAX_FILE_SIZE_MB = 50;
const ALLOWED_EXTENSIONS = /\.(jpe?g|png|heic|heif|webp|gif|mp4|mov|webm)$/i;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { albumId, guestName, files } = await parseMultipart(event);

    if (!albumId) {
      return json(400, { error: 'Missing albumId' });
    }
    if (files.length === 0) {
      return json(400, { error: 'No files received' });
    }

    const safeAlbumId = String(albumId).replace(/[^a-zA-Z0-9-_]/g, '');
    const mediaStore = getStore('media');
    const manifestStore = getStore('manifests');

    const manifestKey = `${safeAlbumId}.json`;
    const existing = await manifestStore.get(manifestKey, { type: 'json' });
    const manifest = existing || { items: [] };

    for (const file of files) {
      const timestamp = Date.now();
      const random = Math.round(Math.random() * 1e6);
      const ext = (file.filename.match(/\.[a-zA-Z0-9]+$/) || [''])[0].toLowerCase();
      const blobKey = `${safeAlbumId}/${timestamp}-${random}${ext}`;

      await mediaStore.set(blobKey, file.data, {
        metadata: { contentType: file.contentType }
      });

      manifest.items.unshift({
        key: blobKey,
        guestName: (guestName || '').slice(0, 80),
        uploadedAt: new Date().toISOString()
      });
    }

    await manifestStore.setJSON(manifestKey, manifest);

    return json(200, { ok: true, count: files.length });
  } catch (err) {
    console.error(err);
    return json(400, { error: err.message || 'Upload failed' });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

// Netlify Functions hand us the raw multipart body base64-encoded; busboy
// parses it the same way it would a normal Node request stream.
function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    const bb = busboy({
      headers: { 'content-type': contentType },
      limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024, files: 20 }
    });

    const files = [];
    let albumId = '';
    let guestName = '';

    bb.on('field', (name, value) => {
      if (name === 'albumId') albumId = value;
      if (name === 'guestName') guestName = value;
    });

    bb.on('file', (name, stream, info) => {
      if (!ALLOWED_EXTENSIONS.test(info.filename)) {
        stream.resume(); // drain and skip unsupported file types
        return;
      }
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => {
        files.push({
          filename: info.filename,
          contentType: info.mimeType,
          data: Buffer.concat(chunks)
        });
      });
    });

    bb.on('error', reject);
    bb.on('finish', () => resolve({ albumId, guestName, files }));

    const body = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body, 'utf8');
    bb.end(body);
  });
}
