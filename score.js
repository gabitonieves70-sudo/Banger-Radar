// Banger Radar scoring engine.
// Every video goes through the 3 hard rules first. If it fails any, it never
// reaches the feed. Survivors get a Banger % (0-100).

const RULES = {
  maxPageAgeDays: 7,      // Rule 1: oldest post on the page must be this new or newer
  maxCompetitors: 10,     // Rule 2: copycat pages + US advertisers above this = saturated
  minUsShare: 0.6,        // Rule 3: at least 60% of comments must look US
  minViews: 10000,        // engagement floor
  minCommentRate: 0.001   // 0.1% comments / views (Banger % still rewards higher)
};

const WEIGHTS = {
  buyIntent: 25,
  engagement: 20,
  velocity: 15,
  newAccount: 15,
  saturation: 10,
  margin: 10,
  wow: 5
};

const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

function saturationLabel(competitors) {
  if (competitors <= 3) return { key: 'fresh', label: 'FRESH' };
  if (competitors <= RULES.maxCompetitors) return { key: 'warm', label: 'WARMING UP' };
  return { key: 'saturated', label: 'SATURATED' };
}

function analyze(v, now = Date.now()) {
  const hoursSincePost = Math.max(0.5, (now - new Date(v.postedAt).getTime()) / 36e5);
  const pageAgeDays = (now - new Date(v.account.oldestPostAt).getTime()) / 864e5;

  const likeRate = v.likes / v.views;
  const commentRate = v.comments / v.views;
  const commentsPerLike = v.likes ? v.comments / v.likes : 0;
  const shareRate = v.shares / v.views;
  const viewsPerHour = v.views / hoursSincePost;
  const outlier = v.account.avgViews ? v.views / v.account.avgViews : null;
  const viewsPerFollower = v.account.followers ? v.views / v.account.followers : 10;
  const competitors = v.saturation.copycatPages + v.saturation.usAds;
  const sat = saturationLabel(competitors);
  const margin = v.price && v.price.sell ? (v.price.sell - v.price.costHigh) / v.price.sell : null;

  // ---- Hard rules ----
  const fails = [];
  if (v.account.tooBig)
    fails.push(`Established page (${v.account.posts} posts, ${v.account.followers} followers), not a new page`);
  else if (v.account.ageKnown === false)
    fails.push("Couldn't verify the page's age");
  else if (pageAgeDays > RULES.maxPageAgeDays)
    fails.push(`Page is ${Math.floor(pageAgeDays)} days old (max ${RULES.maxPageAgeDays})`);
  if (competitors > RULES.maxCompetitors)
    fails.push(`Saturated: ${v.saturation.copycatPages} copycat pages + ${v.saturation.usAds} US ads`);
  if (v.comments_breakdown.usShare < RULES.minUsShare)
    fails.push(`Only ${Math.round(v.comments_breakdown.usShare * 100)}% US audience`);
  if (v.views < RULES.minViews || commentRate < RULES.minCommentRate)
    fails.push('Engagement too weak');

  // ---- Score parts (each 0..1) ----
  const parts = {};
  parts.buyIntent = clamp(v.comments_breakdown.buyIntent / 0.4);
  // "Comment LINK and I'll DM you" captions pump comments - count them at 40%
  const bf = v.captionBait ? 0.4 : 1;
  parts.engagement =
    (clamp(likeRate / 0.1) + clamp(commentRate * bf / 0.02) + clamp(commentsPerLike * bf / 0.2) + clamp(shareRate / 0.01)) / 4;
  parts.velocity = clamp(viewsPerHour / 3000);
  const ageBoost = pageAgeDays <= 2 ? 1 : pageAgeDays <= 5 ? 0.8 : pageAgeDays <= 7 ? 0.5 : 0;
  parts.newAccount = outlier == null
    ? (ageBoost + clamp(viewsPerFollower / 10)) / 2
    : (ageBoost + clamp(viewsPerFollower / 10) + clamp(outlier / 10)) / 3;
  parts.saturation = competitors <= 3 ? 1 : competitors <= RULES.maxCompetitors ? 0.5 - (competitors - 4) * 0.05 : 0;
  parts.margin = margin == null ? 0.5 : clamp((margin - 0.4) / 0.35);   // unknown price = neutral
  parts.wow = v.wowFactor == null ? 0.6 : clamp(v.wowFactor);            // unknown = neutral

  let score = 0;
  for (const k in WEIGHTS) score += parts[k] * WEIGHTS[k];
  // Red-flag comments ("scam", "broke", "looks cheap") pull the score down
  score -= clamp(v.comments_breakdown.redFlag / 0.2) * 15;
  // Giveaway / "comment WIN" bait inflates comments - discount it
  score -= clamp((v.comments_breakdown.bait - 0.15) / 0.35) * 15;
  score = Math.round(clamp(score, 0, 100));

  const tier = score >= 80 ? 'banger' : score >= 60 ? 'test' : 'skip';

  return {
    ...v,
    passed: fails.length === 0,
    fails,
    score,
    tier,
    parts,
    stats: {
      hoursSincePost,
      pageAgeDays,
      likeRate,
      commentRate,
      commentsPerLike,
      shareRate,
      viewsPerHour,
      outlier,
      viewsPerFollower,
      competitors,
      margin
    },
    saturationLabel: sat
  };
}

module.exports = { analyze, RULES, WEIGHTS };
