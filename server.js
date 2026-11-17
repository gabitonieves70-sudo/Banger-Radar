// Banger Radar server v2 - zero dependencies, runs on Railway with `npm start`.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { analyze, WEIGHTS } = require('./score');
const { scan } = require('./scan');
const { kvGet, kvSet } = require('./apify');
const { getSettings, saveSettings, DEFAULTS } = require('./settings');

const PORT = process.env.PORT || 3000;
const INDEX = path.join(__dirname, 'index.html');
const MANUAL_COOLDOWN_MIN = 20;
const PIN = process.env.ADMIN_PIN || '';

const state = { scanning: false, startedAt: null, last: null, lastError: null, lastManualAt: 0 };

async function runScan(reason) {
  if (state.scanning || !process.env.APIFY_TOKEN) return;
  state.scanning = true; state.startedAt = Date.now(); state.lastError = null;
  console.log(`[scan] starting (${reason})`);
  try {
    const result = await scan();
    if (result.errors.length) state.lastError = result.errors.join(' | ');
    if (!result.records.length && !result.ads.length && state.last?.records?.length) {
      state.lastError = 'This scan found nothing new' + (state.lastError ? ': ' + state.lastError : '') + ' - still showing the previous results.';
      return;
    }
    state.last = result;
    kvSet('latest', result).catch(e => console.error('[scan] save failed', e.message));
    console.log(`[scan] done`, result.stats, result.errors);
  } catch (e) {
    state.lastError = e.message;
    console.error('[scan] failed', e);
  } finally {
    state.scanning = false;
  }
}

async function maybeAutoScan() {
  const S = await getSettings();
  const lastAt = state.last ? new Date(state.last.scannedAt).getTime() : 0;
  if (Date.now() - lastAt >= S.scanEveryHours * 36e5) runScan('auto');
}

setTimeout(async () => {
  if (process.env.APIFY_TOKEN) {
    try {
      const saved = await kvGet('latest');
      if (saved && saved.version === 2) { state.last = saved; console.log('[boot] loaded last scan'); }
    } catch (e) { console.error('[boot] could not load saved scan', e.message); }
  }
  maybeAutoScan();
}, 3000);
setInterval(maybeAutoScan, 10 * 60 * 1000);

function sendJson(res, obj, code = 200) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise(resolve => {
    let b = ''; req.on('data', c => { b += c; if (b.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
  });
}
const pinOk = body => !PIN || String(body.pin || '') === PIN;

async function status() {
  const S = await getSettings();
  return {
    connected: !!process.env.APIFY_TOKEN,
    aiConnected: !!process.env.ANTHROPIC_API_KEY,
    pinRequired: !!PIN,
    scanning: state.scanning,
    scanStartedAt: state.startedAt,
    lastScanAt: state.last?.scannedAt || null,
    nextScanAt: state.last ? new Date(new Date(state.last.scannedAt).getTime() + S.scanEveryHours * 36e5).toISOString() : null,
    stats: state.last?.stats || null,
    error: state.lastError || (state.last?.errors?.length ? state.last.errors.join(' | ') : null)
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/data') {
      const S = await getSettings();
      const now = Date.now();
      const videos = (state.last?.records || []).map(v => analyze(v, S, now));
      return sendJson(res, { status: await status(), settings: S, weights: WEIGHTS, videos, ads: state.last?.ads || [] });
    }
    if (url.pathname === '/api/status') return sendJson(res, await status());

    if (url.pathname === '/api/settings' && req.method === 'GET') return sendJson(res, { settings: await getSettings(), defaults: DEFAULTS, pinRequired: !!PIN });
    if (url.pathname === '/api/settings' && req.method === 'POST') {
      const body = await readBody(req);
      if (!pinOk(body)) return sendJson(res, { ok: false, message: 'Wrong PIN.' }, 403);
      const s = await saveSettings(body.settings || {});
      return sendJson(res, { ok: true, settings: s });
    }

    if (url.pathname === '/api/scan' && req.method === 'POST') {
      const body = await readBody(req);
      if (!pinOk(body)) return sendJson(res, { ok: false, message: 'Wrong PIN.' }, 403);
      if (!process.env.APIFY_TOKEN) return sendJson(res, { ok: false, message: 'Apify is not connected yet.' }, 400);
      if (state.scanning) return sendJson(res, { ok: false, message: 'A scan is already running.' }, 409);
      const waitMin = Math.ceil((state.lastManualAt + MANUAL_COOLDOWN_MIN * 6e4 - Date.now()) / 6e4);
      if (waitMin > 0) return sendJson(res, { ok: false, message: `Wait ${waitMin} more min before scanning again (saves Apify credit).` }, 429);
      state.lastManualAt = Date.now();
      runScan('manual');
      return sendJson(res, { ok: true, message: 'Scan started. It takes a few minutes.' });
    }

    if (url.pathname === '/health') return sendJson(res, { ok: true });

    if (url.pathname === '/' || url.pathname === '/index.html') {
      return fs.readFile(INDEX, (err, data) => {
        if (err) { res.writeHead(500); return res.end('Missing index.html'); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(data);
      });
    }
    res.writeHead(404); res.end('Not found');
  } catch (e) {
    console.error(e);
    sendJson(res, { ok: false, message: e.message }, 500);
  }
});

server.listen(PORT, () => console.log(`Banger Radar running on port ${PORT}`));
