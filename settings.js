// Banger Radar settings - editable from the site's ⚙️ Settings panel.
// Saved in the Apify key-value store so they survive code updates.

const { kvGet, kvSet } = require('./apify');

const DEFAULTS = {
  // What to search on Instagram (and TikTok if on). Hook phrases + niches.
  keywords: [
    // Hook formats
    'concept vs result', 'what people think we sell vs', '1980 vs 2026', 'expectation vs reality',
    'tiktok made me buy it', 'amazon finds', 'gift idea for her', 'gift idea for him',
    // "This is for you" audiences
    'dog owners this is for you', 'dog lovers this is for you', 'pet owners this is for you',
    'cat owners this is for you', 'star wars fans this is for you', 'girls this is for you',
    'boys this is for you', 'men this is for you', 'women this is for you', 'moms this is for you',
    'car guys this is for you', 'gamers this is for you',
    // Proven niches
    'dog gadget', 'cat toy', 'baby must haves', 'car accessories', 'kitchen gadget', 'home gadget'
  ],
  // Facebook / Instagram ad search words (Meta Ad Library, US only)
  adKeywords: ['dog', 'cat', 'baby', 'car', 'kitchen', 'gift'],

  maxAgeDays: 7,        // post must be this new or newer
  minViews: 50000,
  minComments: 80,
  minLikeRatePct: 1,    // likes as % of views
  minUsPct: 60,         // % of comments that look American
  maxCopycats: 10,

  perKeyword: 20,       // Instagram reels per keyword (only matching reels are charged)
  deepChecks: 8,        // top reels that get comments read + full Claude breakdown
  adsPerKeyword: 5,
  apifyFreePlan: true,  // free plan: Instagram search only returns 3 full reels per run, so run 1 keyword per run

  sources: { instagram: true, facebookAds: true, tiktok: false },
  tiktokKeywords: 4,
  tiktokPerKeyword: 5,

  scanEveryHours: 24
};

let cache = null;

function clean(input) {
  const s = { ...DEFAULTS, ...(input || {}) };
  s.sources = { ...DEFAULTS.sources, ...(input?.sources || {}) };
  const list = x => (Array.isArray(x) ? x : String(x || '').split(/[\n,]/)).map(k => String(k).trim()).filter(Boolean).slice(0, 80);
  s.keywords = list(s.keywords);
  s.adKeywords = list(s.adKeywords).slice(0, 20);
  const n = (v, lo, hi, d) => { const x = Number(v); return isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
  s.maxAgeDays = n(s.maxAgeDays, 1, 30, 7);
  s.minViews = n(s.minViews, 0, 1e9, 50000);
  s.minComments = n(s.minComments, 0, 1e7, 80);
  s.minLikeRatePct = n(s.minLikeRatePct, 0, 50, 1);
  s.minUsPct = n(s.minUsPct, 0, 100, 60);
  s.maxCopycats = n(s.maxCopycats, 0, 100, 10);
  s.perKeyword = n(s.perKeyword, 1, 100, 20);
  s.deepChecks = n(s.deepChecks, 0, 50, 15);
  s.adsPerKeyword = n(s.adsPerKeyword, 1, 50, 10);
  s.tiktokKeywords = n(s.tiktokKeywords, 0, 20, 4);
  s.tiktokPerKeyword = n(s.tiktokPerKeyword, 1, 30, 5);
  s.scanEveryHours = n(s.scanEveryHours, 1, 168, 24);
  for (const k of Object.keys(s.sources)) s.sources[k] = !!s.sources[k];
  s.apifyFreePlan = s.apifyFreePlan !== false;
  return s;
}

async function getSettings() {
  if (cache) return cache;
  try { cache = clean(await kvGet('settings')); } catch { cache = clean(null); }
  return cache;
}

async function saveSettings(input) {
  const s = clean(input);
  await kvSet('settings', s);
  cache = s;
  return s;
}

module.exports = { getSettings, saveSettings, DEFAULTS, clean };
