// Netlify Function: streams one stored file back to the browser.
// The gallery and lightbox both point <img>/<video> src at this endpoint.
//
// Endpoint (after deploy): GET /.netlify/functions/media?key=<blobKey>

const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const key = event.queryStringParameters?.key;
  if (!key) {
    return { statusCode: 400, body: 'Missing key parameter' };
  }

  const mediaStore = getStore('media');
  const result = await mediaStore.getWithMetadata(key, { type: 'arrayBuffer' });

  if (!result) {
    return { statusCode: 404, body: 'Not found' };
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': result.metadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable'
    },
    body: Buffer.from(result.data).toString('base64'),
    isBase64Encoded: true
  };
};
