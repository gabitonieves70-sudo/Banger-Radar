// Claude brain for Banger Radar. Uses ANTHROPIC_API_KEY from Railway.
// Pass 1 (cheap): look at captions, throw out anything that isn't a physical dropshippable product.
// Pass 2 (per finalist): read comments + caption, return product name, niche, buyer, intent, US %, price
//   guess, variants and a content kit.

const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-5-5';

async function ask(prompt, maxTokens = 1500, retry = true) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(90000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${data.error?.message || 'error'}`);
  const text = (data.content || []).map(c => c.text || '').join('');
  const m = text.match(/[\[{][\s\S]*[\]}]/);
  try {
    if (!m) throw new Error('no JSON');
    return JSON.parse(m[0]);
  } catch (e) {
    if (retry) return ask(prompt + '\n\nIMPORTANT: keep every text field short and reply with complete, valid JSON only.', maxTokens + 2000, false);
    throw new Error(`Claude reply wasn't valid JSON (${data.stop_reason || e.message})`);
  }
}

const enabled = () => !!process.env.ANTHROPIC_API_KEY;

// ---- Pass 1: which candidates are real products? ----
async function screenProducts(cands) {
  if (!enabled() || !cands.length) return null;
  const list = cands.map((c, i) => `${i}. [${c.platform}] ${String(c.caption || '').replace(/\s+/g, ' ').slice(0, 280)}`).join('\n');
  const out = await ask(`You screen social videos for a US dropshipper. For each caption below decide if the video is mainly showing ONE specific physical product someone could buy and dropship (gadget, pet item, baby item, decor, accessory, toy, etc).
NOT products: food/restaurant deals, apps, services, vlogs, courses, "make money" content, makeup tutorials with many items, hauls of many unrelated items, memes.

Captions:
${list}

Reply with ONLY a JSON array, one object per caption, same order:
[{"i":0,"product":true,"name":"Short product name (2-6 words)"}]`, 4000);
  const map = new Map();
  for (const r of Array.isArray(out) ? out : []) if (typeof r.i === 'number') map.set(r.i, r);
  return cands.map((_, i) => map.get(i) || { product: true, name: null });
}

// ---- Pass 2: full breakdown of one video ----
async function analyzeVideo(v, comments) {
  const coms = comments.slice(0, 40).map(c => '- ' + String(c).replace(/\s+/g, ' ').slice(0, 160)).join('\n') || '(no comments available)';
  return ask(`You are a product researcher for a US-only TikTok/Instagram dropshipping brand. Analyze this viral video.

Platform: ${v.platform}
Stats: ${v.views} views, ${v.likes} likes, ${v.comments} comments, ${v.shares} shares
Caption: ${String(v.caption || '').slice(0, 600)}
Sample comments:
${coms}

Rules for comments: "buy intent" = the person wants to buy/own it or asks where/how much (e.g. "link?", "need this for my mom", "how much"). "red flag" = says it's a scam, cheap, broke, fake, AI. "bait" = only typed a keyword because the caption said "comment X for the link", giveaway entries, tagging friends with no opinion. "us_share" = share of commenters who look like they're in the USA (English, US slang/places/prices; Spanish, Hindi, Portuguese, other countries count as non-US).

The brand makes AI-generated UGC videos: vertical 9:16, authentic iPhone look (not cinematic), deep focus no bokeh, cool bright modern lighting, Seedance 2.0 clips 4-6 seconds each. Favorite hooks: "ran to Costco/Walmart and found this" shelf grab, "drink drop" in-store pan to the product box, problem/solution demo, gift reaction.

Reply with ONLY this JSON:
{
 "is_product": true,
 "product_name": "2-6 word name",
 "niche": "Dogs|Cats|Pets|Baby|Kids|Car|Kitchen|Home|Beauty|Fitness|Faith|Holiday|Gadgets|Outdoors|Fashion|Other",
 "sub_niche": "short",
 "who_buys": "one line",
 "age": "e.g. 25-45",
 "lean": "Mostly women|Mostly men|Mixed|Mostly moms|...",
 "why_buy": "one line (problem-solver, gift, impulse, cute, etc)",
 "season": "Evergreen or holiday name + note",
 "wow_factor": 0.0,
 "buy_intent": 0.0, "hype": 0.0, "red_flag": 0.0, "bait": 0.0, "us_share": 0.0,
 "best_quotes": ["up to 3 short real comments showing buy intent"],
 "cost_low": 0, "cost_high": 0, "sell_price": 0,
 "verdict": "one sentence: is this a banger for a US store and why",
 "variants": [{"name":"new version idea","angle":"why it could blow up"}],
 "hooks": ["3 short scroll-stopping hook lines"],
 "video_idea": "one 4-beat UGC video concept using the brand's style",
 "seedance_prompt": "one ready Seedance 2.0 prompt for the first 4-6s clip",
 "image_prompt": "one GPT Image / Nano Banana prompt for a product box or hero still"
}
Numbers 0.0-1.0 for shares/wow. Prices in USD (supplier cost range, realistic US sell price). Give exactly 3 variants (theme swap, audience swap, holiday/season swap). Keep prompts under 90 words each. JSON only, no markdown.`, 4000);
}

module.exports = { enabled, screenProducts, analyzeVideo, MODEL };
