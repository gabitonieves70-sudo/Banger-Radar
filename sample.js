// SAMPLE DATA - made-up videos so the site works before real scraping is connected.
// Times are relative to "now" so the feed always looks fresh.
// Once Apify is connected, real scraped videos replace this file.

const H = 36e5, D = 864e5;

const raw = [
  {
    id: 's1', product: 'Light-up dog raincoat', platform: 'instagram',
    search: 'light up dog raincoat', hoursAgo: 14, pageAgeDays: 3,
    account: { handle: 'pawsyfinds', followers: 2300, posts: 9, avgViews: 2400 },
    views: 52000, likes: 5100, comments: 1100, shares: 640,
    cb: { buyIntent: 0.41, hype: 0.38, redFlag: 0.02, bait: 0.01, usShare: 0.84,
      quotes: ['link??', 'where can I get this', 'my chihuahua NEEDS this'] },
    niche: ['Dogs', 'Apparel'], seasonal: 'Evergreen (peaks in rainy months)',
    audience: { who: 'Small-dog owners, "dog mom" crowd, gift buyers', age: '25-45', lean: 'Mostly women', why: 'Cute + safety at night (impulse)' },
    price: { costLow: 6, costHigh: 9, sell: 32 },
    sat: { copycatPages: 1, usAds: 0, adDays: 0 }, wow: 0.9
  },
  {
    id: 's2', product: 'Cat window bubble hammock', platform: 'tiktok',
    search: 'cat window bubble hammock', hoursAgo: 30, pageAgeDays: 2,
    account: { handle: 'whiskerwonders.shop', followers: 810, posts: 5, avgViews: 1900 },
    views: 118000, likes: 13400, comments: 2600, shares: 2100,
    cb: { buyIntent: 0.46, hype: 0.35, redFlag: 0.03, bait: 0.0, usShare: 0.79,
      quotes: ['how much is it', 'does it hold a 15lb cat?', 'ordering for my sister'] },
    niche: ['Cats', 'Furniture'], seasonal: 'Evergreen',
    audience: { who: 'Indoor-cat owners, apartment renters', age: '20-40', lean: 'Mostly women', why: 'Solves boredom + looks cool' },
    price: { costLow: 11, costHigh: 15, sell: 44 },
    sat: { copycatPages: 2, usAds: 1, adDays: 4 }, wow: 0.95
  },
  {
    id: 's3', product: 'Glow sensory bath toy set', platform: 'facebook',
    search: 'glow bath toys toddler', hoursAgo: 8, pageAgeDays: 1,
    account: { handle: 'tinytubtime', followers: 340, posts: 3, avgViews: 900 },
    views: 31000, likes: 2600, comments: 820, shares: 410,
    cb: { buyIntent: 0.38, hype: 0.30, redFlag: 0.01, bait: 0.02, usShare: 0.88,
      quotes: ['need this for bath time', 'link please', 'are they waterproof?'] },
    niche: ['Baby', 'Bath'], seasonal: 'Evergreen, strong before Christmas',
    audience: { who: 'Parents of toddlers, grandparents (gifts)', age: '24-40', lean: 'Mostly moms', why: 'Makes bath time easier' },
    price: { costLow: 4, costHigh: 7, sell: 27 },
    sat: { copycatPages: 0, usAds: 1, adDays: 2 }, wow: 0.85
  },
  {
    id: 's4', product: 'Magnetic car seat-gap light organizer', platform: 'instagram',
    search: 'car seat gap organizer light', hoursAgo: 40, pageAgeDays: 5,
    account: { handle: 'cartok.essentials', followers: 5100, posts: 14, avgViews: 3200 },
    views: 64000, likes: 4300, comments: 700, shares: 520,
    cb: { buyIntent: 0.29, hype: 0.25, redFlag: 0.04, bait: 0.0, usShare: 0.81,
      quotes: ['where to buy', 'fits a Tacoma?', 'need 2'] },
    niche: ['Car', 'Accessories'], seasonal: 'Evergreen, good gift item',
    audience: { who: 'Commuters, new car owners, guys buying for their car', age: '18-35', lean: 'Mixed, slightly men', why: 'Problem-solver (stuff falls in the gap)' },
    price: { costLow: 5, costHigh: 8, sell: 24 },
    sat: { copycatPages: 3, usAds: 3, adDays: 6 }, wow: 0.65
  },
  {
    id: 's5', product: 'Personalized pet ornament (photo engraved)', platform: 'facebook',
    search: 'pet photo ornament engraved', hoursAgo: 20, pageAgeDays: 4,
    account: { handle: 'furevermemories.co', followers: 1200, posts: 7, avgViews: 1500 },
    views: 44000, likes: 4700, comments: 1300, shares: 1600,
    cb: { buyIntent: 0.44, hype: 0.40, redFlag: 0.01, bait: 0.03, usShare: 0.9,
      quotes: ['can I get one with 2 dogs?', 'how long shipping before Christmas', 'crying, need this'] },
    niche: ['Pets', 'Holiday gifts'], seasonal: 'Christmas - about 5 weeks out',
    audience: { who: 'Pet owners, people who lost a pet, gift buyers', age: '25-60', lean: 'Mostly women', why: 'Emotional gift' },
    price: { costLow: 4, costHigh: 6, sell: 29 },
    sat: { copycatPages: 2, usAds: 2, adDays: 5 }, wow: 0.7
  },
  {
    id: 's6', product: 'Star projector night-light turtle (new design)', platform: 'tiktok',
    search: 'galaxy night light kids projector', hoursAgo: 55, pageAgeDays: 6,
    account: { handle: 'dreamyroomz', followers: 2900, posts: 18, avgViews: 2600 },
    views: 39000, likes: 2900, comments: 410, shares: 300,
    cb: { buyIntent: 0.24, hype: 0.30, redFlag: 0.05, bait: 0.02, usShare: 0.74,
      quotes: ['is it loud?', 'link', 'my kid would love it'] },
    niche: ['Kids', 'Room decor'], seasonal: 'Evergreen, strong before Christmas',
    audience: { who: 'Parents of kids 3-10', age: '25-40', lean: 'Mostly moms', why: 'Helps kids sleep' },
    price: { costLow: 8, costHigh: 12, sell: 34 },
    sat: { copycatPages: 5, usAds: 3, adDays: 12 }, wow: 0.75
  },

  // ---- These fail the hard rules (shown only with "Show filtered out") ----
  {
    id: 'f1', product: 'Ice-roller face massager', platform: 'tiktok',
    search: 'ice roller face', hoursAgo: 16, pageAgeDays: 120,
    account: { handle: 'glowupdaily', followers: 88000, posts: 410, avgViews: 30000 },
    views: 210000, likes: 18000, comments: 1900, shares: 900,
    cb: { buyIntent: 0.22, hype: 0.3, redFlag: 0.06, bait: 0.05, usShare: 0.77, quotes: ['link', 'does it work?'] },
    niche: ['Beauty', 'Skincare'], seasonal: 'Evergreen',
    audience: { who: 'Skincare girls', age: '16-30', lean: 'Mostly women', why: 'Trend' },
    price: { costLow: 2, costHigh: 4, sell: 19 },
    sat: { copycatPages: 46, usAds: 31, adDays: 90 }, wow: 0.4
  },
  {
    id: 'f2', product: 'Pet hair remover roller', platform: 'instagram',
    search: 'pet hair remover roller', hoursAgo: 22, pageAgeDays: 4,
    account: { handle: 'cleanpaws.store', followers: 1500, posts: 6, avgViews: 1800 },
    views: 47000, likes: 3900, comments: 900, shares: 300,
    cb: { buyIntent: 0.30, hype: 0.2, redFlag: 0.08, bait: 0.0, usShare: 0.7, quotes: ['saw this everywhere', 'link'] },
    niche: ['Pets', 'Cleaning'], seasonal: 'Evergreen',
    audience: { who: 'Pet owners', age: '25-55', lean: 'Mixed', why: 'Problem-solver' },
    price: { costLow: 3, costHigh: 5, sell: 22 },
    sat: { copycatPages: 22, usAds: 14, adDays: 60 }, wow: 0.55
  },
  {
    id: 'f3', product: 'Mini portable blender bottle', platform: 'facebook',
    search: 'portable blender bottle', hoursAgo: 12, pageAgeDays: 2,
    account: { handle: 'blendgo.world', followers: 600, posts: 4, avgViews: 1100 },
    views: 76000, likes: 6800, comments: 1500, shares: 400,
    cb: { buyIntent: 0.35, hype: 0.25, redFlag: 0.03, bait: 0.01, usShare: 0.21, quotes: ['price in rupees?', 'ship to Manila?'] },
    niche: ['Fitness', 'Kitchen'], seasonal: 'Evergreen',
    audience: { who: 'Gym-goers', age: '18-35', lean: 'Mixed', why: 'Convenience' },
    price: { costLow: 6, costHigh: 9, sell: 29 },
    sat: { copycatPages: 3, usAds: 1, adDays: 3 }, wow: 0.5
  },
  {
    id: 'f4', product: 'Dog paw cleaner cup', platform: 'tiktok',
    search: 'dog paw cleaner cup', hoursAgo: 60, pageAgeDays: 19,
    account: { handle: 'muddypups', followers: 9400, posts: 52, avgViews: 6000 },
    views: 58000, likes: 3800, comments: 500, shares: 220,
    cb: { buyIntent: 0.21, hype: 0.2, redFlag: 0.04, bait: 0.0, usShare: 0.83, quotes: ['link?'] },
    niche: ['Dogs', 'Cleaning'], seasonal: 'Evergreen',
    audience: { who: 'Dog owners', age: '25-55', lean: 'Mixed', why: 'Problem-solver' },
    price: { costLow: 4, costHigh: 6, sell: 24 },
    sat: { copycatPages: 9, usAds: 6, adDays: 40 }, wow: 0.5
  }
];

function searchUrl(platform, q) {
  const e = encodeURIComponent(q);
  if (platform === 'tiktok') return `https://www.tiktok.com/search?q=${e}`;
  if (platform === 'facebook') return `https://www.facebook.com/search/videos/?q=${e}`;
  return `https://www.instagram.com/explore/tags/${encodeURIComponent(q.replace(/\s+/g, ''))}/`;
}

function getSampleVideos(now = Date.now()) {
  return raw.map(r => ({
    id: r.id,
    sample: true,
    product: r.product,
    platform: r.platform,
    url: searchUrl(r.platform, r.search),
    postedAt: new Date(now - r.hoursAgo * H).toISOString(),
    account: { ...r.account, oldestPostAt: new Date(now - r.pageAgeDays * D).toISOString() },
    views: r.views, likes: r.likes, comments: r.comments, shares: r.shares,
    comments_breakdown: r.cb,
    niche: r.niche,
    seasonal: r.seasonal,
    audience: r.audience,
    price: r.price,
    saturation: r.sat,
    wowFactor: r.wow
  }));
}

module.exports = { getSampleVideos };
