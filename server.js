// Banger Radar server - zero dependencies, runs on Railway with `npm start`.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { analyze, RULES, WEIGHTS } = require('./score');
const { getSampleVideos } = require('./sample');

const PORT = process.env.PORT || 3000;
const INDEX = path.join(__dirname, 'index.html');

function sendJson(res, obj) {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/api/videos') {
    const now = Date.now();
    const videos = getSampleVideos(now).map(v => analyze(v, now));
    return sendJson(res, { source: 'sample', updatedAt: new Date(now).toISOString(), rules: RULES, weights: WEIGHTS, videos });
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
