// Tiny Apify client - starts an Actor run, waits for it (up to maxMinutes),
// then returns the dataset items. Even if a run times out, whatever it
// collected is still returned. Uses the APIFY_TOKEN variable set in Railway.

const API = 'https://api.apify.com/v2';

async function call(path, opts = {}) {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN is not set');
  const res = await fetch(API + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(90000)
  });
  const text = await res.text();
  if (res.ok && !text) return {};
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try { msg = JSON.parse(text).error?.message || msg; } catch {}
    throw new Error(`Apify ${res.status}: ${msg}`);
  }
  return JSON.parse(text);
}

async function runActor(actorId, input, { maxMinutes = 12, actorTimeoutSecs = 600 } = {}) {
  const id = actorId.replace('/', '~');
  let run = (await call(`/acts/${id}/runs?timeout=${actorTimeoutSecs}&waitForFinish=60`, {
    method: 'POST', body: JSON.stringify(input)
  })).data;

  const deadline = Date.now() + maxMinutes * 60000;
  while (['READY', 'RUNNING'].includes(run.status) && Date.now() < deadline) {
    run = (await call(`/actor-runs/${run.id}?waitForFinish=60`)).data;
  }
  if (['READY', 'RUNNING'].includes(run.status)) {
    await call(`/actor-runs/${run.id}/abort`, { method: 'POST' }).catch(() => {});
  }
  if (run.status === 'FAILED') throw new Error(`${actorId} failed`);

  const items = await call(`/datasets/${run.defaultDatasetId}/items?clean=true&limit=5000`);
  return (Array.isArray(items) ? items : []).filter(i => !i.error && !i.errorCode);
}

// Small saved-results store inside the user's Apify account, so a code update
// on Railway doesn't wipe the last scan (and trigger a paid re-scan).
let storeId = null;
async function store() {
  if (storeId) return storeId;
  storeId = (await call('/key-value-stores?name=banger-radar', { method: 'POST' })).data.id;
  return storeId;
}
async function kvGet(key) {
  const id = await store();
  const token = process.env.APIFY_TOKEN;
  const res = await fetch(`${API}/key-value-stores/${id}/records/${key}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Apify store ' + res.status);
  return res.json();
}
async function kvSet(key, value) {
  const id = await store();
  await call(`/key-value-stores/${id}/records/${key}`, { method: 'PUT', body: JSON.stringify(value) });
}

module.exports = { runActor, kvGet, kvSet };
