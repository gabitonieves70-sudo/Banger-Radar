// Banger Radar server - zero dependencies, runs on Railway with `npm start`.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { analyze, RULES, WEIGHTS } = require('./score');
const { getSampleVideos } = require('./sample');
const { scan, config } = require('./scan');
const { kvGet, kvSet } = require('./apify');

const PORT = process.env.PORT || 3000;
const INDEX = path.join(__dirname, 'index.html');
const DATA_DIR = path.join(__dirname, 'data');
const CACHE = path.join(DATA_DIR, 'latest.json');
const MANUAL_COOLDOWN_MIN = 30;

const state = { scanning: false, startedAt: null, last: null, lastError: null, lastManualAt: 0 };

try { state.last = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch {}

async function runScan(reason) {
  if (state.scanning || !process.env.APIFY_TOKEN) return;
  state.scanning = true; state.startedAt = Date.now(); state.lastError = null;
  console.log(`[scan] starting (${reason})`);
  try {
    const result = await scan();
    state.last = result;
    if (result.errors.length) state.lastError = result.errors.join(' | ');
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CACHE, JSON.stringify(result));
    kvSet('latest', result).catch(e => console.error('[scan] could not save to Apify store', e.message));
    console.log(`[scan] done: pulled ${result.stats.pulled}, kept ${result.records.length}`, result.errors);
  } catch (e) {
    state.lastError = e.message;
    console.error('[scan] failed', e);
  } finally {
    state.scanning = false;
  }
}

// Auto-scan: on boot if there's no recent scan, then every SCAN_EVERY_HOURS
function maybeAutoScan() {
  const every = config().everyHours * 36e5;
  const lastAt = state.last ? new Date(state.last.scannedAt).getTime() : 0;
  if (Date.now() - lastAt >= every) runScan('auto');
}
// On boot: reload the last scan from the Apify store first, so code updates don't cost a re-scan
setTimeout(async () => {
  if (!state.last && process.env.APIFY_TOKEN) {
    try { const saved = await kvGet('latest'); if (saved && saved.records) { state.last = saved; console.log('[boot] loaded last scan from Apify store'); } }
    catch (e) { console.error('[boot] could not load saved scan', e.message); }
  }
  maybeAutoScan();
}, 3000);
setInterval(maybeAutoScan, 10 * 60 * 1000);

function sendJson(res, obj, code = 200) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function statusInfo() {
  const cfg = config();
  return {
    connected: !!process.env.APIFY_TOKEN,
    aiConnected: !!process.env.ANTHROPIC_API_KEY,
    scanning: state.scanning,
    scanStartedAt: state.startedAt,
    lastScanAt: state.last?.scannedAt || null,
    nextScanAt: state.last ? new Date(new Date(state.last.scannedAt).getTime() + cfg.everyHours * 36e5).toISOString() : null,
    stats: state.last?.stats || null,
    error: state.lastError,
    queries: cfg.queries
  };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/api/videos') {
    const now = Date.now();
    const useSample = url.searchParams.get('sample') === '1' || !state.last;
    const raw = useSample ? getSampleVideos(now) : state.last.records;
    const videos = raw.map(v => analyze(v, now));
    return sendJson(res, { source: useSample ? 'sample' : 'live', status: statusInfo(), rules: RULES, weights: WEIGHTS, videos });
  }

  if (url.pathname === '/api/status') return sendJson(res, statusInfo());

  if (url.pathname === '/api/scan' && req.method === 'POST') {
    if (!process.env.APIFY_TOKEN) return sendJson(res, { ok: false, message: 'Apify is not connected yet.' }, 400);
    if (state.scanning) return sendJson(res, { ok: false, message: 'A scan is already running.' }, 409);
    const waitMin = Math.ceil((state.lastManualAt + MANUAL_COOLDOWN_MIN * 6e4 - Date.now()) / 6e4);
    if (waitMin > 0) return sendJson(res, { ok: false, message: `Wait ${waitMin} more min before scanning again (saves Apify credits).` }, 429);
    state.lastManualAt = Date.now();
    runScan('manual');
    return sendJson(res, { ok: true, message: 'Scan started. It takes a few minutes.' });
  }

  if (url.pathname === '/health') return sendJson(res, { ok: true });

  if (url.pathname === '/' || url.pathname === '/index.html') {
    return fs.readFile(INDEX, (err, data) => {
      if (err) { res.writeHead(500); return res.end('Missing index.html'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
  }
  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => console.log(`Banger Radar running on port ${PORT}`));
