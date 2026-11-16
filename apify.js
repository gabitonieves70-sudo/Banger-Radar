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

// What kind of run is this (search vs profile check vs comments)? Used to find a reusable past run.
const KINDS = ['hashtags', 'searchQueries', 'profiles', 'postURLs', 'usernames', 'directUrls'];
const kindOf = input => KINDS.filter(k => Array.isArray(input?.[k]) && input[k].length).sort().join('+');

let outOfCredit = false;
function resetCreditFlag() { outOfCredit = false; }

// Out of Apify credit: reuse the newest finished run of the same kind (reading old data is free)
async function reuseLatest(actorId, input) {
  const id = actorId.replace('/', '~');
  const runs = (await call(`/acts/${id}/runs?desc=true&limit=25`)).data?.items || [];
  const want = kindOf(input);
  for (const r of runs) {
    if (!['SUCCEEDED', 'TIMED-OUT', 'ABORTED'].includes(r.status)) continue;
    if (Date.now() - new Date(r.finishedAt || r.startedAt).getTime() > 6 * 864e5) continue;
    const inp = await call(`/key-value-stores/${r.defaultKeyValueStoreId}/records/INPUT`).catch(() => null);
    if (!inp || kindOf(inp) !== want) continue;
    const items = await call(`/datasets/${r.defaultDatasetId}/items?clean=true&limit=5000`);
    const list = (Array.isArray(items) ? items : []).filter(i => !i.error && !i.errorCode);
    if (list.length) { list.reused = r.startedAt; return list; }
  }
  return [];
}

async function runActor(actorId, input, { maxMinutes = 12, actorTimeoutSecs = 600 } = {}) {
  const id = actorId.replace('/', '~');
  if (outOfCredit) return reuseLatest(actorId, input);
  let run;
  try {
    run = (await call(`/acts/${id}/runs?timeout=${actorTimeoutSecs}&waitForFinish=60`, {
      method: 'POST', body: JSON.stringify(input)
    })).data;
  } catch (e) {
    if (/Apify 402/.test(e.message)) { outOfCredit = true; return reuseLatest(actorId, input); }
    throw e;
  }

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

module.exports = { runActor, kvGet, kvSet, resetCreditFlag, isOutOfCredit: () => outOfCredit };
