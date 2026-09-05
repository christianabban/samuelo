const Busboy = require('busboy');
const { getStore } = require('@netlify/blobs');

const MAX_FILE_SIZE = 50 * 1024 * 1024;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed' });
  }

  try {
    const { fields, files } = await parseMultipart(event);
    const action = fields.action;

    if (action === 'chunk') {
      return await saveChunk(fields, files.media);
    }

    if (action === 'complete') {
      return await completeUpload(fields);
    }

    return json(400, { ok: false, error: 'Unknown upload action.' });
  } catch (err) {
    console.error(err);
    return json(500, { ok: false, error: err.message || 'Upload failed.' });
  }
};

async function saveChunk(fields, file) {
  const required = ['albumId', 'uploadId', 'chunkIndex', 'totalChunks', 'filename', 'contentType'];
  const missing = required.filter((name) => !fields[name]);
  if (missing.length || !file?.buffer?.length) {
    return json(400, { ok: false, error: `Missing upload data: ${missing.concat(!file?.buffer?.length ? ['media'] : []).join(', ')}` });
  }

  const safeAlbumId = safeId(fields.albumId);
  const uploadId = safeId(fields.uploadId);
  const chunkIndex = parseInteger(fields.chunkIndex);
  const totalChunks = parseInteger(fields.totalChunks);

  if (!safeAlbumId || !uploadId || !Number.isInteger(chunkIndex) || !Number.isInteger(totalChunks)) {
    return json(400, { ok: false, error: 'Invalid upload data.' });
  }

  if (chunkIndex < 0 || totalChunks < 1 || chunkIndex >= totalChunks) {
    return json(400, { ok: false, error: 'Invalid chunk number.' });
  }

  const chunksStore = getStore('upload-chunks');
  const key = chunkKey(safeAlbumId, uploadId, chunkIndex);
  await chunksStore.set(key, toArrayBuffer(file.buffer), {
    metadata: {
      filename: fields.filename,
      contentType: normalizeContentType(fields.contentType),
      totalChunks
    }
  });

  return json(200, { ok: true });
}

async function completeUpload(fields) {
  const required = ['albumId', 'uploadId', 'totalChunks', 'filename', 'contentType'];
  const missing = required.filter((name) => !fields[name]);
  if (missing.length) {
    return json(400, { ok: false, error: `Missing upload data: ${missing.join(', ')}` });
  }

  const safeAlbumId = safeId(fields.albumId);
  const uploadId = safeId(fields.uploadId);
  const totalChunks = parseInteger(fields.totalChunks);
  const filename = String(fields.filename);
  const contentType = normalizeContentType(fields.contentType);

  if (!safeAlbumId || !uploadId || !Number.isInteger(totalChunks) || totalChunks < 1) {
    return json(400, { ok: false, error: 'Invalid upload data.' });
  }

  const chunksStore = getStore('upload-chunks');
  const buffers = [];
  let totalSize = 0;

  for (let i = 0; i < totalChunks; i++) {
    const chunk = await chunksStore.get(chunkKey(safeAlbumId, uploadId, i), { type: 'arrayBuffer' });
    if (!chunk) {
      return json(400, { ok: false, error: `Missing part ${i + 1} of ${totalChunks}. Please try uploading again.` });
    }

    const buffer = Buffer.from(chunk);
    totalSize += buffer.length;
    if (totalSize > MAX_FILE_SIZE) {
      await deleteChunks(chunksStore, safeAlbumId, uploadId, totalChunks);
      return json(413, { ok: false, error: 'That file is too large. Please keep each photo or video under 50 MB.' });
    }
    buffers.push(buffer);
  }

  const uploadedAt = new Date().toISOString();
  const mediaBuffer = Buffer.concat(buffers);
  const mediaStore = getStore('media');
  const mediaKey = `albums/${safeAlbumId}/${Date.now()}-${randomId()}-${safeFilename(filename)}`;

  await mediaStore.set(mediaKey, toArrayBuffer(mediaBuffer), {
    metadata: {
      albumId: safeAlbumId,
      filename,
      contentType,
      uploadedAt
    }
  });

  await addManifestItem(safeAlbumId, {
    key: mediaKey,
    filename,
    contentType,
    uploadedAt
  });

  await deleteChunks(chunksStore, safeAlbumId, uploadId, totalChunks);

  return json(200, { ok: true, key: mediaKey });
}

function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    if (!contentType?.startsWith('multipart/form-data')) {
      reject(new Error('Expected multipart form data.'));
      return;
    }

    const fields = {};
    const files = {};
    const busboy = Busboy({ headers: { 'content-type': contentType } });

    busboy.on('field', (name, value) => {
      fields[name] = value;
    });

    busboy.on('file', (name, stream, info) => {
      const chunks = [];
      stream.on('data', (data) => chunks.push(data));
      stream.on('end', () => {
        files[name] = {
          filename: info.filename,
          mimeType: info.mimeType,
          buffer: Buffer.concat(chunks)
        };
      });
    });

    busboy.on('error', reject);
    busboy.on('finish', () => resolve({ fields, files }));

    const body = Buffer.from(event.body || '', event.isBase64Encoded ? 'base64' : 'utf8');
    busboy.end(body);
  });
}

async function addManifestItem(albumId, item) {
  const manifestStore = getStore('manifests');
  const manifestKey = `${albumId}.json`;
  const manifest = (await manifestStore.get(manifestKey, { type: 'json' })) || { items: [] };
  const items = Array.isArray(manifest.items) ? manifest.items : [];

  items.unshift(item);

  await manifestStore.setJSON(manifestKey, {
    items,
    updatedAt: new Date().toISOString()
  });
}

async function deleteChunks(store, albumId, uploadId, totalChunks) {
  await Promise.allSettled(
    Array.from({ length: totalChunks }, (_, i) => store.delete(chunkKey(albumId, uploadId, i)))
  );
}

function chunkKey(albumId, uploadId, chunkIndex) {
  return `${albumId}/${uploadId}/${chunkIndex}`;
}

function safeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 100);
}

function safeFilename(value) {
  const cleaned = String(value || 'upload')
    .replace(/[\\/]/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);

  return cleaned || 'upload';
}

function normalizeContentType(value) {
  const contentType = String(value || '').toLowerCase();
  if (contentType.startsWith('image/') || contentType.startsWith('video/')) {
    return contentType;
  }
  return 'application/octet-stream';
}

function parseInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}
