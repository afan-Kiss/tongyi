const DEBUG_ENDPOINT = 'http://127.0.0.1:7423/ingest/00b07a67-c9d2-4479-805d-94cb0e719154';
const DEBUG_SESSION = '124bda';

function debugLog(location, message, data = {}, hypothesisId = '') {
  // #region agent log
  fetch(DEBUG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': DEBUG_SESSION },
    body: JSON.stringify({
      sessionId: DEBUG_SESSION,
      location,
      message,
      data,
      hypothesisId,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

module.exports = { debugLog };
