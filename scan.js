// Banger Radar scan v2 - Instagram first.
// 1. Instagram Reels keyword search (memo23/instagram-reels-search-scraper): only reels posted in the
//    last N days with enough views + comments come back (and only those are charged).
// 2. Facebook/Instagram ads from the Meta Ad Library (apify/facebook-ads-scraper), US only.
// 3. TikTok (optional, off by default).
// Then: Claude throws out non-products, the top reels get their comments read and a full breakdown.

const { runActor, resetCreditFlag, isOutOfCredit } = require('./apify');
const { getSettings } = require('./settings');
const T = require('./textcheck');
const AI = require('./ai');

const DAY = 864e5;
const num = v => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : (typeof v === 'string' && /^\d+$/.test(v) ? +v : 0));
const shortcode = u => (String(u || '').match(/\/(?:p|reel|reels|tv)\/([\w-]+)/) || [])[1] || null;
function decode(t) {
  return String(t || '').replace(/(?:\\u[0-9a-fA-F]{4})+/g, m => { try { return JSON.parse('"' + m + '"'); } catch { return m; } });
}
async function settle(label, p, log) {
  try { return await p; } catch (e) { log.push(`${label}: ${e.message}`); return []; }
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k], k); }
  }));
}
const isoDaysAgo = d => new Date(Date.now() - d * DAY).toISOString().slice(0, 10);

// ---------- normalizers ----------
function fromIgSearch(i) {
  const code = i.shortCode || shortcode(i.url);
  return {
    platform: 'instagram',
    id: 'ig_' + (code || i.mediaPk || i.url),
    url: i.url || (code ? `https://www.instagram.com/reel/${code}/` : ''),
    thumb: i.thumbnailUrl || null,
    handle: i.username || 'unknown',
    caption: decode(i.caption),
    postedAt: i.takenAt,
    views: num(i.playCount), likes: num(i.likeCount), comments: num(i.commentCount), shares: num(i.shareCount),
    query: i.query || null
  };
}
function fromTikTok(i) {
  const a = i.authorMeta || {};
  return {
    platform: 'tiktok',
    id: 'tt_' + (i.id || i.webVideoUrl),
    url: i.webVideoUrl || '',
    thumb: i.videoMeta?.coverUrl || null,
    handle: a.name || 'unknown',
    caption: decode(i.text),
    postedAt: i.createTimeISO,
    views: num(i.playCount), likes: num(i.diggCount), comments: num(i.commentCount), shares: num(i.shareCount),
    query: null
  };
}
function fromAd(a) {
  const s = a.snapshot || {};
  const start = a.startDateFormatted || (a.startDate ? new Date(a.startDate * 1000).toISOString() : null);
  const id = a.adArchiveID || a.adArchiveId;
  return {
    id: 'ad_' + id,
    pageName: a.pageName || 'Unknown page',
    startedAt: start,
    text: decode(s.body?.text || ''),
    title: decode(s.title || ''),
    linkUrl: s.linkUrl || null,
    platforms: a.publisherPlatform || [],
    thumb: s.videos?.[0]?.videoPreviewImageUrl || s.images?.[0]?.resizedImageUrl || null,
    adUrl: id ? `https://www.facebook.com/ads/library/?id=${id}` : null,
    variations: a.collationCount || 1
  };
}

// ---------- main ----------
async function scan() {
  const S = await getSettings();
  const now = Date.now();
  const log = [];
  resetCreditFlag();

  const minDate = isoDaysAgo(S.maxAgeDays);

  const igTask = S.sources.instagram && S.keywords.length ? settle('Instagram search', runActor('memo23/instagram-reels-search-scraper', {
    queries: S.keywords, maxResultsPerQuery: S.perKeyword, oldestPostDate: minDate,
    minimumViews: S.minViews, minimumComments: S.minComments,
    contentType: 'reels_only', englishOnly: true, includeHistorical: false
  }, { maxMinutes: 15 }), log) : Promise.resolve([]);

  const ttTask = S.sources.tiktok && S.tiktokKeywords > 0 ? settle('TikTok search', runActor('clockworks/tiktok-scraper', {
    searchQueries: S.keywords.slice(0, S.tiktokKeywords), searchSection: '/video', videoSearchDateFilter: 'PAST_WEEK',
    videoSearchSorting: 'MOST_LIKED', resultsPerPage: S.tiktokPerKeyword, proxyCountryCode: 'US',
    shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadAvatars: false,
    shouldDownloadMusicCovers: false, shouldDownloadSlideshowImages: false
  }), log) : Promise.resolve([]);

  const adTask = S.sources.facebookAds && S.adKeywords.length ? settle('Facebook ads', runActor('apify/facebook-ads-scraper', {
    startUrls: S.adKeywords.map(k => ({ url: `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&is_targeted_country=false&media_type=video&q=${encodeURIComponent(k)}&search_type=keyword_unordered` })),
    resultsLimit: S.adsPerKeyword * S.adKeywords.length, activeStatus: 'active', onlyAdsNewerThan: `${S.maxAgeDays} days`
  }), log) : Promise.resolve([]);

  const [igRaw, ttRaw, adRaw] = await Promise.all([igTask, ttTask, adTask]);

  // ---- videos: normalize, dedupe, hard number filters ----
  const seen = new Set();
  const all = [...igRaw.map(fromIgSearch), ...ttRaw.map(fromTikTok)].filter(v => {
    if (!v.url || seen.has(v.id)) return false;
    seen.add(v.id); return true;
  });
  const fresh = all.filter(v => {
    const t = new Date(v.postedAt).getTime();
    return t && now - t <= S.maxAgeDays * DAY && v.views >= S.minViews && v.comments >= S.minComments
      && (v.likes / Math.max(1, v.views)) * 100 >= S.minLikeRatePct;
  });
  fresh.forEach(v => { v.rank = (v.comments / v.views) * 0.6 + (v.likes / v.views) * 0.2 + Math.log10(v.views) * 0.01; });
  fresh.sort((a, b) => b.rank - a.rank);

  // ---- Claude pass 1: real products only + short names ----
  let videos = fresh.slice(0, 80);
  let notProducts = 0;
  if (AI.enabled() && videos.length) {
    try {
      const verdicts = await AI.screenProducts(videos);
      videos.forEach((v, k) => { v.aiName = verdicts[k]?.name || null; v.isProduct = verdicts[k]?.product !== false; });
      notProducts = videos.filter(v => !v.isProduct).length;
      videos = videos.filter(v => v.isProduct);
    } catch (e) { log.push('AI product check: ' + e.message); }
  }

  // ---- ads: normalize, keep this week's, Claude product check ----
  let ads = adRaw.map(fromAd).filter(a => a.startedAt && now - new Date(a.startedAt).getTime() <= (S.maxAgeDays + 1) * DAY);
  const adSeen = new Set();
  ads = ads.filter(a => { if (adSeen.has(a.id)) return false; adSeen.add(a.id); return true; });
  if (AI.enabled() && ads.length) {
    try {
      const top = ads.slice(0, 80);
      const verdicts = await AI.screenProducts(top.map(a => ({ platform: 'facebook ad', caption: `${a.pageName}: ${a.title} ${a.text}` })));
      top.forEach((a, k) => { a.product = verdicts[k]?.name || null; a.isProduct = verdicts[k]?.product !== false; });
      ads = top.filter(a => a.isProduct !== false);
    } catch (e) { log.push('AI ad check: ' + e.message); }
  }
  const perPage = {};
  for (const a of ads) perPage[a.pageName] = (perPage[a.pageName] || 0) + 1;
  for (const a of ads) a.pageAdCount = perPage[a.pageName];

  // ---- saturation: same product from other pages in this scan + running as US ads ----
  const STOPW = new Set(['the', 'and', 'for', 'with', 'set', 'kit', 'new']);
  const nameWords = x => new Set((String(x || '').toLowerCase().match(/[a-z]{3,}/g) || []).filter(w => !STOPW.has(w)));
  const overlap = (a, b) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n; };
  for (const v of videos) {
    const mine = nameWords(v.aiName || v.caption.slice(0, 80));
    const pages = new Set(), adPages = new Set();
    for (const o of videos) if (o !== v && o.handle !== v.handle && overlap(mine, nameWords(o.aiName || o.caption.slice(0, 80))) >= 2) pages.add(o.handle);
    for (const a of ads) if (overlap(mine, nameWords(a.product || a.title)) >= 2) adPages.add(a.pageName);
    v.copycats = pages.size; v.usAds = adPages.size;
  }

  // ---- deep check: comments + full Claude breakdown for the top ones ----
  const deepSet = new Set(videos.slice(0, S.deepChecks).map(v => v.id));
  const deep = videos.filter(v => deepSet.has(v.id));
  const igUrls = deep.filter(v => v.platform === 'instagram').map(v => v.url);
  const ttUrls = deep.filter(v => v.platform === 'tiktok').map(v => v.url);
  const [igComments, ttComments] = await Promise.all([
    igUrls.length ? settle('Instagram comments', runActor('apify/instagram-comment-scraper', { directUrls: igUrls, resultsLimit: 30 }), log) : [],
    ttUrls.length ? settle('TikTok comments', runActor('clockworks/tiktok-comments-scraper', { postURLs: ttUrls, commentsPerPost: 30 }), log) : []
  ]);
  const com = new Map();
  const add = (k, t) => { if (!k || !t) return; if (!com.has(k)) com.set(k, []); com.get(k).push(decode(t)); };
  for (const c of igComments) add(shortcode(c.postUrl || c.inputUrl || c.url), c.text);
  for (const c of ttComments) add(c.videoWebUrl || c.submittedVideoUrl || c.inputUrl, c.text);

  const records = videos.map(v => {
    const texts = com.get(v.platform === 'instagram' ? shortcode(v.url) : v.url) || [];
    const bait = T.captionBait(v.caption);
    const cb = T.classifyComments(texts, bait);
    const { niche, audience } = T.detectNiche(v.caption + ' ' + texts.join(' '));
    return {
      id: v.id, platform: v.platform, url: v.url, thumb: v.thumb, query: v.query,
      product: v.aiName || T.productName(v.caption), caption: v.caption.slice(0, 400),
      handle: v.handle, postedAt: v.postedAt,
      views: v.views, likes: v.likes, comments: v.comments, shares: v.shares,
      captionBait: bait,
      comments_breakdown: cb || { buyIntent: null, hype: null, redFlag: 0, bait: 0, usShare: null, quotes: [], sampleSize: 0, estimated: true },
      niche, audience, seasonal: T.seasonal(v.caption),
      saturation: { copycatPages: v.copycats, usAds: v.usAds },
      deep: deepSet.has(v.id), price: null, productFit: null, wowFactor: null, ai: null,
      _texts: texts
    };
  });

  if (AI.enabled()) {
    let fails = 0;
    await pool(records.filter(r => r.deep), 3, async r => {
      try {
        const a = await AI.analyzeVideo(r, r._texts);
        const f = x => (typeof x === 'number' && isFinite(x) ? Math.max(0, Math.min(1, x)) : null);
        const read = r._texts.length > 0;
        r.product = a.product_name || r.product;
        r.notProduct = a.is_product === false;
        r.niche = [a.niche || r.niche[0], a.sub_niche].filter(Boolean);
        r.audience = { who: a.who_buys || r.audience.who, age: a.age || '—', lean: a.lean || '—', why: a.why_buy || '—' };
        r.seasonal = a.season || r.seasonal;
        r.wowFactor = f(a.wow_factor); r.productFit = f(a.product_fit);
        if (a.sell_price > 0 && a.cost_high > 0) r.price = { costLow: a.cost_low || a.cost_high, costHigh: a.cost_high, sell: a.sell_price };
        r.comments_breakdown = {
          buyIntent: f(a.buy_intent), hype: f(a.hype), redFlag: f(a.red_flag) ?? 0, bait: f(a.bait) ?? 0,
          usShare: read ? f(a.us_share) : null,
          quotes: (a.best_quotes || []).filter(Boolean).slice(0, 3),
          sampleSize: r._texts.length, estimated: !read, ai: true
        };
        r.ai = {
          verdict: a.verdict || '', risks: a.risks || '', variants: (a.variants || []).slice(0, 3), hooks: (a.hooks || []).slice(0, 3),
          videoIdea: a.video_idea || '', seedancePrompt: a.seedance_prompt || '', imagePrompt: a.image_prompt || ''
        };
      } catch (e) { if (++fails === 1) log.push('AI breakdown: ' + e.message); }
    });
  }
  for (const r of records) delete r._texts;

  if (isOutOfCredit()) log.unshift('Apify credit ran out during this scan, so some data was reused from earlier scans or skipped.');

  return {
    version: 2,
    scannedAt: new Date(now).toISOString(),
    stats: {
      instagram: igRaw.length, tiktok: ttRaw.length, ads: adRaw.length,
      passedNumbers: fresh.length, notProducts, products: records.length, deepChecked: records.filter(r => r.deep).length,
      adProducts: ads.length, ai: AI.enabled(), outOfCredit: isOutOfCredit()
    },
    errors: log,
    records,
    ads: ads.sort((a, b) => b.pageAdCount - a.pageAdCount || new Date(b.startedAt) - new Date(a.startedAt)).slice(0, 60)
  };
}

module.exports = { scan };
