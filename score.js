// Banger Radar scoring v2 - the POST matters, not the account.
// Hard rules (from Settings): posted within N days, min views, min comments, min like rate,
// a real product, mostly-US comments, not saturated. Survivors get a Banger % (0-100).

const WEIGHTS = {
  buyIntent: 25,     // % of comments that want to buy
  engagement: 20,    // like rate, comment rate, comments-per-like, shares
  velocity: 15,      // views per hour since posted
  productFit: 20,    // Claude: wow factor, pain point/emotion, impulse price, markup, evergreen
  saturation: 10,    // few other pages / US ads on it
  margin: 10         // estimated supplier cost vs. sell price
};

const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

function analyze(v, S, now = Date.now()) {
  const hours = Math.max(0.5, (now - new Date(v.postedAt).getTime()) / 36e5);
  const cb = v.comments_breakdown || {};
  const likeRate = v.likes / Math.max(1, v.views);
  const commentRate = v.comments / Math.max(1, v.views);
  const commentsPerLike = v.likes ? v.comments / v.likes : 0;
  const shareRate = (v.shares || 0) / Math.max(1, v.views);
  const viewsPerHour = v.views / hours;
  const competitors = (v.saturation?.copycatPages || 0) + (v.saturation?.usAds || 0);
  const margin = v.price && v.price.sell ? (v.price.sell - v.price.costHigh) / v.price.sell : null;

  // ---- hard rules, each with pass/fail so the site can show a checklist ----
  const rules = [
    { key: 'age', label: `Posted within ${S.maxAgeDays} days`, ok: hours <= S.maxAgeDays * 24, value: hours < 48 ? `${Math.round(hours)} hrs ago` : `${Math.round(hours / 24)} days ago` },
    { key: 'views', label: `${S.minViews.toLocaleString()}+ views`, ok: v.views >= S.minViews, value: v.views.toLocaleString() },
    { key: 'comments', label: `${S.minComments}+ comments`, ok: v.comments >= S.minComments, value: v.comments.toLocaleString() },
    { key: 'likes', label: `Like rate ${S.minLikeRatePct}%+`, ok: likeRate * 100 >= S.minLikeRatePct, value: (likeRate * 100).toFixed(1) + '%' },
    { key: 'product', label: 'Real physical product', ok: !v.notProduct, value: v.notProduct ? 'No (Claude)' : 'Yes' },
    { key: 'us', label: `${S.minUsPct}%+ US audience`, ok: cb.usShare == null ? null : cb.usShare * 100 >= S.minUsPct, value: cb.usShare == null ? 'not checked' : Math.round(cb.usShare * 100) + '%' },
    { key: 'sat', label: `Not saturated (≤ ${S.maxCopycats})`, ok: competitors <= S.maxCopycats, value: `${v.saturation?.copycatPages || 0} pages · ${v.saturation?.usAds || 0} ads` }
  ];
  const fails = rules.filter(r => r.ok === false);

  // ---- score parts (0..1) ----
  const bf = v.captionBait ? 0.4 : 1;   // "comment LINK for the link" pumps comments
  const parts = {
    buyIntent: cb.buyIntent == null ? clamp(commentsPerLike * bf / 0.15) * 0.6 : clamp(cb.buyIntent / 0.4),
    engagement: (clamp(likeRate / 0.08) + clamp(commentRate * bf / 0.01) + clamp(commentsPerLike * bf / 0.1) + clamp(shareRate / 0.01)) / 4,
    velocity: clamp(Math.log10(Math.max(1, viewsPerHour)) / 4),       // 10K views/hr = max
    productFit: v.productFit == null ? 0.5 : v.productFit,
    saturation: competitors === 0 ? 1 : clamp(1 - competitors / (S.maxCopycats + 1)),
    margin: margin == null ? 0.5 : clamp((margin - 0.4) / 0.35)
  };
  let score = 0;
  for (const k in WEIGHTS) score += parts[k] * WEIGHTS[k];
  score -= clamp((cb.redFlag || 0) / 0.2) * 15;
  score -= clamp(((cb.bait || 0) - 0.15) / 0.35) * 15;
  score = Math.round(clamp(score, 0, 100));

  const passed = fails.length === 0;
  const tier = !passed ? (fails.length === 1 && !v.notProduct ? 'close' : 'out') : score >= 75 ? 'banger' : 'test';

  return {
    ...v, passed, fails: fails.map(f => f.label), rules, score, tier, parts,
    stats: { hours, likeRate, commentRate, commentsPerLike, shareRate, viewsPerHour, competitors, margin }
  };
}

module.exports = { analyze, WEIGHTS };
