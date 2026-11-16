// Tiny Apify client - runs an Actor and returns its dataset items.
// Uses the APIFY_TOKEN variable set in Railway.

async function runActor(actorId, input, timeoutSecs = 280) {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN is not set');
  const id = actorId.replace('/', '~');
  const url = `https://api.apify.com/v2/acts/${id}/run-sync-get-dataset-items?timeout=${timeoutSecs}&clean=true`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout((timeoutSecs + 30) * 1000)
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try { msg = JSON.parse(text).error?.message || msg; } catch {}
    throw new Error(`${actorId} failed (${res.status}): ${msg}`);
  }
  const items = JSON.parse(text);
  return Array.isArray(items) ? items.filter(i => !i.error && !i.errorCode) : [];
}

module.exports = { runActor };
