// Real scan: pulls this week's Instagram Reels + TikToks through Apify,
// filters by engagement, checks each page's age, reads comments, and builds
// records for score.js.
//
// Railway variables you can change (all optional):
//   SCAN_QUERIES      comma list of searches (default below)
//   PER_QUERY         videos per search per platform (default 15)
//   MAX_CHECKS        how many top videos get the deep page-age + comment check (default 12)
//   SCAN_EVERY_HOURS  auto-scan interval (default 24)
//   TIKTOK_QUERIES    how many of the searches also run on TikTok (default 4 - TikTok costs more)
//   TIKTOK_PER_QUERY  TikToks per search (default 10)
//   MIN_VIEWS         minimum views to count (default 10000)

const { runActor } = require('./apify');
const T = require('./textcheck');

const DAY = 864e5;
const DEFAULT_QUERIES = [
  'tiktok made me buy it', 'amazon finds', 'dog products', 'cat products',
  'baby must haves', 'car accessories', 'home gadgets', 'viral products'
];

function config() {
  const q = (process.env.SCAN_QUERIES || '').split(',').map(s => s.trim()).filter(Boolean);
  return {
    queries: q.length ? q : DEFAULT_QUERIES,
    perQuery: +process.env.PER_QUERY || 15,
    maxChecks: +process.env.MAX_CHECKS || 12,
    everyHours: +process.env.SCAN_EVERY_HOURS || 24,
    tiktokQueries: +process.env.TIKTOK_QUERIES || 4,
    minViews: +process.env.MIN_VIEWS || 10000,
    tiktokPerQuery: +process.env.TIKTOK_PER_QUERY || 10
  };
}

const num = v => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0);

const shortcode = u => (String(u || '').match(/\/(?:p|reel|reels|tv)\/([\w-]+)/) || [])[1] || null;

function fromInstagram(i) {
  const views = num(i.videoPlayCount) || num(i.igPlayCount) || num(i.videoViewCount);
  return {
    viewsHidden: !views,
    platform: 'instagram',
    id: 'ig_' + (i.id || i.shortCode || i.url),
    url: i.url || (i.shortCode ? `https://www.instagram.com/reel/${i.shortCode}/` : ''),
    handle: i.ownerUsername || 'unknown',
    caption: i.caption || '',
    postedAt: i.timestamp,
    views, likes: num(i.likesCount), comments: num(i.commentsCount), shares: num(i.sharesCount),
    commentTexts: [...(i.latestComments || []).map(c => (typeof c === 'string' ? c : c?.text)), i.firstComment].filter(Boolean),
    followers: null, posts: null
  };
}

function fromTikTok(i) {
  const a = i.authorMeta || {};
  return {
    platform: 'tiktok',
    viewsHidden: false,
    id: 'tt_' + (i.id || i.webVideoUrl),
    url: i.webVideoUrl || '',
    handle: a.name || 'unknown',
    caption: i.text || '',
    postedAt: i.createTimeISO,
    views: num(i.playCount), likes: num(i.diggCount), comments: num(i.commentCount), shares: num(i.shareCount),
    commentTexts: [],
    followers: a.fans ?? null, posts: a.video ?? null
  };
}

async function settle(label, p, log) {
  try { return await p; } catch (e) { log.push(`${label}: ${e.message}`); return []; }
}

async function scan() {
  const cfg = config();
  const now = Date.now();
  const log = [];

  // ---- 1. Pull this week's videos ----
  const [igRaw, ttRaw] = await Promise.all([
    settle('Instagram search', runActor('apify/instagram-hashtag-scraper', {
      hashtags: cfg.queries.map(q => q.replace(/[^\w]/g, '').toLowerCase()), keywordSearch: false,
      resultsType: 'posts', resultsLimit: cfg.perQuery
    }), log),
    settle('TikTok search', runActor('clockworks/tiktok-scraper', {
      searchQueries: cfg.queries.slice(0, cfg.tiktokQueries), searchSection: '/video', videoSearchDateFilter: 'PAST_WEEK', videoSearchSorting: 'MOST_LIKED',
      resultsPerPage: cfg.tiktokPerQuery, proxyCountryCode: 'US',
      shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadAvatars: false,
      shouldDownloadMusicCovers: false, shouldDownloadSlideshowImages: false
    }), log)
  ]);

  const seen = new Set();
  const all = [...igRaw.map(fromInstagram), ...ttRaw.map(fromTikTok)].filter(v => {
    if (!v.url || seen.has(v.id)) return false;
    seen.add(v.id); return true;
  });

  // ---- 2. Engagement + freshness pre-filter ----
  const fresh = all.filter(v => {
    const t = new Date(v.postedAt).getTime();
    if (!t || now - t > 7 * DAY) return false;
    if (v.viewsHidden) return v.likes >= 1000 && v.comments / Math.max(1, v.likes) >= 0.03;
    return v.views >= cfg.minViews && v.comments / v.views >= 0.005;
  });
  // Views hidden on some IG posts: estimate from likes (~8% like rate) so the math works
  for (const v of fresh) if (v.viewsHidden) v.views = Math.round(v.likes / 0.08);

  // one video per page (its best one), ranked by comment strength
  const bestByPage = new Map();
  for (const v of fresh) {
    const k = v.platform + ':' + v.handle;
    const rank = (v.comments / v.views) * Math.log10(v.views);
    if (!bestByPage.has(k) || rank > bestByPage.get(k).rank) bestByPage.set(k, { ...v, rank });
  }
  let finalists = [...bestByPage.values()].sort((a, b) => b.rank - a.rank);

  // Obvious old/big pages fail without spending money on a page check
  const tooBig = v => (v.posts != null && v.posts > 100) || (v.followers != null && v.followers > 200000);
  const skipped = finalists.filter(tooBig);
  finalists = finalists.filter(v => !tooBig(v)).slice(0, cfg.maxChecks);

  // ---- 3. Page-age checks + TikTok comments ----
  const igNames = [...new Set(finalists.filter(v => v.platform === 'instagram').map(v => v.handle))];
  const ttNames = [...new Set(finalists.filter(v => v.platform === 'tiktok').map(v => v.handle))];
  const ttUrls = finalists.filter(v => v.platform === 'tiktok').map(v => v.url);

  const igUrls = finalists.filter(v => v.platform === 'instagram').map(v => v.url);
  const [igProfiles, ttOldest, ttComments, igComments] = await Promise.all([
    igNames.length ? settle('Instagram page check', runActor('apify/instagram-profile-scraper', { usernames: igNames }), log) : [],
    ttNames.length ? settle('TikTok page check', runActor('clockworks/tiktok-scraper', {
      profiles: ttNames, profileSorting: 'oldest', resultsPerPage: 1, excludePinnedPosts: false,
      proxyCountryCode: 'US', shouldDownloadVideos: false, shouldDownloadCovers: false
    }), log) : [],
    ttUrls.length ? settle('TikTok comments', runActor('clockworks/tiktok-comments-scraper', {
      postURLs: ttUrls, commentsPerPost: 30
    }), log) : [],
    igUrls.length ? settle('Instagram comments', runActor('apify/instagram-comment-scraper', {
      directUrls: igUrls, resultsLimit: 30
    }), log) : []
  ]);
  const igCom = new Map();
  for (const c of igComments) {
    const code = shortcode(c.postUrl || c.inputUrl || c.url);
    if (!code || !c.text) continue;
    if (!igCom.has(code)) igCom.set(code, []);
    igCom.get(code).push(c.text);
  }

  const igMap = new Map(igProfiles.map(p => [String(p.username || '').toLowerCase(), p]));
  const ttOld = new Map();
  for (const i of ttOldest) {
    const n = String(i.authorMeta?.name || '').toLowerCase();
    const t = new Date(i.createTimeISO).getTime();
    if (n && t && (!ttOld.has(n) || t < ttOld.get(n).t)) ttOld.set(n, { t, posts: i.authorMeta?.video, fans: i.authorMeta?.fans });
  }
  const ttCom = new Map();
  for (const c of ttComments) {
    const key = c.videoWebUrl || c.submittedVideoUrl || c.inputUrl;
    if (!key || !c.text) continue;
    if (!ttCom.has(key)) ttCom.set(key, []);
    ttCom.get(key).push(c.text);
  }

  // ---- 4. Build records ----
  const records = [];
  for (const v of [...finalists, ...skipped]) {
    const notes = [];
    let oldestPostAt = null, avgViews = null, followers = v.followers, posts = v.posts, ageExact = false;

    if (v.platform === 'instagram') {
      const p = igMap.get(v.handle.toLowerCase());
      if (p) {
        followers = p.followersCount ?? followers;
        posts = p.postsCount ?? posts;
        const lp = (p.latestPosts || []).filter(x => x.timestamp);
        const times = lp.map(x => new Date(x.timestamp).getTime()).filter(Boolean);
        if (p.about?.date_joined) {
          const j = new Date(p.about.date_joined).getTime();
          if (j) { oldestPostAt = new Date(j).toISOString(); ageExact = true; }
        }
        if (!oldestPostAt && times.length) {
          oldestPostAt = new Date(Math.min(...times)).toISOString();
          ageExact = posts != null && posts <= lp.length;
          if (!ageExact) notes.push('Page has more posts than we can see, so it may be even older');
        }
        const vv = lp.map(x => num(x.videoViewCount)).filter(Boolean);
        if (vv.length) avgViews = vv.reduce((a, b) => a + b, 0) / vv.length;
      }
    } else {
      const o = ttOld.get(v.handle.toLowerCase());
      if (o) {
        oldestPostAt = new Date(o.t).toISOString(); ageExact = true;
        posts = o.posts ?? posts; followers = o.fans ?? followers;
      }
    }

    // Comments
    const texts = v.platform === 'tiktok' ? (ttCom.get(v.url) || []) : [...(igCom.get(shortcode(v.url)) || []), ...v.commentTexts];
    const baitWord = T.captionBait(v.caption);
    if (baitWord) notes.push(`Caption says "comment ${baitWord}" to get a link, so the comment count is pumped up. Scored with that in mind.`);
    if (v.viewsHidden) notes.push('Views are hidden on this post, so they are estimated from likes');
    let cb = T.classifyComments(texts, baitWord);
    if (!cb) {
      const us = T.captionLooksUS(v.caption);
      cb = { buyIntent: Math.min(0.35, (v.comments / Math.max(1, v.likes)) * 1.2), hype: 0.3, redFlag: 0, bait: 0,
        usShare: us, quotes: [], sampleSize: 0, estimated: true };
      notes.push("Couldn't read comments, so buy intent and US % are estimated from the caption and comment ratio");
    }

    // Saturation: other pages in this scan posting the same kind of product
    const kw = T.keywords(v.caption);
    let copy = 0;
    const counted = new Set([v.handle]);
    if (kw.size >= 2) {
      for (const o of all) {
        if (counted.has(o.handle)) continue;
        const ok = T.keywords(o.caption);
        let shared = 0; for (const w of kw) if (ok.has(w)) shared++;
        if (shared >= 3) { copy++; counted.add(o.handle); }
      }
    }

    const text = v.caption + ' ' + texts.join(' ');
    const { niche, audience } = T.detectNiche(text);

    records.push({
      id: v.id,
      sample: false,
      product: T.productName(v.caption),
      caption: v.caption.slice(0, 300),
      platform: v.platform,
      url: v.url,
      postedAt: v.postedAt,
      account: {
        handle: v.handle,
        followers: followers ?? 0,
        posts: posts ?? 0,
        avgViews,
        oldestPostAt: oldestPostAt || new Date(0).toISOString(),
        ageKnown: !!oldestPostAt,
        ageExact,
        tooBig: tooBig({ posts, followers })
      },
      views: v.views, likes: v.likes, comments: v.comments, shares: v.shares,
      comments_breakdown: cb,
      niche, audience,
      seasonal: T.seasonal(text),
      price: null,
      saturation: { copycatPages: copy, usAds: 0, adDays: 0, adsChecked: false },
      wowFactor: null,
      captionBait: baitWord,
      viewsEstimated: !!v.viewsHidden,
      notes
    });
  }

  return {
    scannedAt: new Date(now).toISOString(),
    stats: { pulled: all.length, instagram: igRaw.length, tiktok: ttRaw.length, passedEngagement: fresh.length, deepChecked: finalists.length },
    errors: log,
    records
  };
}

module.exports = { scan, config };
