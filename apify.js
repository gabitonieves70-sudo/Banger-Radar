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

module.exports = { runActor };
