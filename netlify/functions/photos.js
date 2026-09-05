// Netlify Function: returns the list of uploaded items for an album, with
// URLs the browser can load directly (via the media function below).
//
// Endpoint (after deploy): GET /.netlify/functions/photos?album=<albumId>

const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const albumId = event.queryStringParameters?.album;
  if (!albumId) {
    return json(400, { error: 'Missing album parameter' });
  }

  const safeAlbumId = String(albumId).replace(/[^a-zA-Z0-9-_]/g, '');
  const manifestStore = getStore('manifests');
  const manifest = await manifestStore.get(`${safeAlbumId}.json`, { type: 'json' });

  const items = (manifest?.items || []).map((item) => ({
    url: `/.netlify/functions/media?key=${encodeURIComponent(item.key)}`,
    guestName: item.guestName,
    uploadedAt: item.uploadedAt
  }));

  return json(200, { items });
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}
