// Quick, no-AI text checks. These get replaced by Claude once ANTHROPIC_API_KEY is added.

const BUY = /\b(link|where (can|do|did) (i|you|u) (get|buy|find|order)|where.*(get|buy) (this|it|one)|how much|price|cost|need (this|one|it|two|2)|want (this|one|it)|ordering|ordered|buying|bought|add(ed)? to cart|ship(s|ping)?|website|shop|store|sold|in stock|for my (mom|dad|kid|son|daughter|wife|husband|gf|bf|dog|cat|baby|sister|brother)|take my money|gift)\b|\$|🛒/i;
const RED = /\b(scam|fake|broke|broken|cheap(ly)?|waste|returned|refund|don'?t buy|didn'?t work|doesn'?t work|stopped working|garbage|trash|ripoff|rip off|ai generated|is this ai|dangerous|never (came|arrived))\b/i;
const BAIT = /\b(giveaway|comment (win|yes|me|below)|tag (a|your|3)|follow (me|back)|f4f|check my (page|bio)|dm me)\b/i;
const NON_LATIN = /[Ѐ-ӿ؀-ۿऀ-ॿ฀-๿぀-ヿ一-鿿가-힯]/;
const FOREIGN_WORDS = /\b(comenta|enlace|envío|envio|necesitas|productos|compras|hola|gracias|que|muy|quiero|donde|cuanto|precio|amigo|hermoso|obrigad[oa]|quero|onde|preço|bonito|ich|nicht|wie|sehr|merci|très|combien|bhai|kitne|kitna|rupees?|₹|pesos?|reais|r\$|ship to (india|philippines|manila|nigeria|pakistan|brazil|uk|canada|australia))\b/i;
const US_HINT = /\b(usa|u\.s\.|america|texas|florida|california|new york|ohio|georgia|walmart|target|amazon|costco|y'?all|bro|fr|ngl|lowkey|bestie)\b/i;

// "Comment LINK and I'll DM you" style captions - returns the keyword or null
function captionBait(caption) {
  const c = String(caption || '');
  const m = c.match(/\b(?:comment|comenta|commente|kommentiere|type|drop)\s*(?:the word\s*)?["“'‘]?([A-Za-z0-9]{2,15}|[\u{1F300}-\u{1FAFF}])["”'’]?\s*(?:below\s*)?(?:and|&|\+|to|for|y|if)\b/iu)
    || c.match(/\b(?:comment|comenta)\s*["“']([^"”']{2,15})["”']/i);
  return m ? m[1].trim() : null;
}

function classifyComments(comments, baitWord = null) {
  const list = (comments || []).map(c => String(c || '').trim()).filter(Boolean);
  if (!list.length) return null;
  let buy = 0, red = 0, bait = 0, hype = 0, us = 0;
  const buyQuotes = [];
  for (const c of list) {
    const isBait = BAIT.test(c) || (baitWord && c.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase() === baitWord.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()), isRed = RED.test(c), isBuy = !isBait && BUY.test(c);
    if (isBait) bait++;
    else if (isRed) red++;
    else if (isBuy) { buy++; if (buyQuotes.length < 3 && c.length < 70) buyQuotes.push(c); }
    else if (/[!😍🔥😂❤️💀🙌]|need|love|cute|omg|want|obsessed|genius/i.test(c)) hype++;
    // US-ness: English + no foreign signs
    const foreign = NON_LATIN.test(c) || FOREIGN_WORDS.test(c);
    if (!foreign) us += US_HINT.test(c) ? 1 : 0.85;
  }
  const n = list.length;
  const quotes = buyQuotes.length ? buyQuotes : list.filter(c => c.length < 60).slice(0, 3);
  return {
    buyIntent: buy / n, hype: hype / n, redFlag: red / n, bait: bait / n,
    usShare: Math.min(1, us / n), quotes, sampleSize: n, estimated: true
  };
}

function captionLooksUS(text) {
  const t = String(text || '');
  if (!t.trim()) return 0.65;
  if (NON_LATIN.test(t) || FOREIGN_WORDS.test(t)) return 0.25;
  return US_HINT.test(t) ? 0.85 : 0.72;
}

// ---- Niche + audience (simple keyword map) ----
const NICHES = [
  ['Dogs', /\b(dog|dogs|puppy|pup|doggo|canine|k9|dogmom|doglover)\b/i, 'Dog owners, "dog mom" crowd, gift buyers', '25-45', 'Mostly women'],
  ['Cats', /\b(cat|cats|kitten|kitty|feline|catmom|catlover)\b/i, 'Cat owners, apartment renters', '20-40', 'Mostly women'],
  ['Pets', /\b(pet|pets|petlover|hamster|bird|parrot|fish tank|aquarium)\b/i, 'Pet owners', '20-50', 'Mixed'],
  ['Baby', /\b(baby|babies|newborn|toddler|infant|momlife|newmom|nursery|pregnan)\w*/i, 'New parents, moms-to-be, baby-shower gift buyers', '22-38', 'Mostly moms'],
  ['Kids', /\b(kid|kids|children|child|boys|girls|playroom|toy|toys)\b/i, 'Parents of kids 3-12, grandparents', '25-45', 'Mostly moms'],
  ['Car', /\b(car|cars|truck|vehicle|carmod|cartok|driving|dashboard|jeep|tesla)\b/i, 'Drivers, car guys, commuters', '18-40', 'Slightly men'],
  ['Kitchen', /\b(kitchen|cooking|cook|recipe|baking|chef|airfryer|air fryer)\b/i, 'Home cooks', '25-55', 'Mostly women'],
  ['Home', /\b(home|room|bedroom|decor|cleaning|clean|organiz\w*|house|apartment|lamp|light)\b/i, 'Homeowners, renters, decor lovers', '22-45', 'Mostly women'],
  ['Beauty', /\b(skin|skincare|makeup|beauty|hair|nails|lashes|glow)\b/i, 'Beauty & self-care shoppers', '16-35', 'Mostly women'],
  ['Fitness', /\b(gym|workout|fitness|yoga|pilates|abs|protein)\b/i, 'Gym-goers', '18-35', 'Mixed'],
  ['Faith', /\b(jesus|god|christian|faith|bible|church|pray|blessed)\b/i, 'Christian shoppers, gift buyers', '25-60', 'Mixed'],
  ['Holiday', /\b(christmas|xmas|halloween|thanksgiving|valentine|easter|holiday)\b/i, 'Seasonal gift buyers, decorators', '22-55', 'Mostly women'],
  ['Gadgets', /\b(gadget|gadgets|tech|phone|iphone|gaming|gamer|setup)\b/i, 'Tech & gadget lovers', '16-35', 'Slightly men']
];

function detectNiche(text) {
  for (const [name, re, who, age, lean] of NICHES) {
    if (re.test(text)) return { niche: [name], audience: { who, age, lean, why: 'AI breakdown coming soon' } };
  }
  return { niche: ['General'], audience: { who: 'Broad audience', age: '—', lean: '—', why: 'AI breakdown coming soon' } };
}

function seasonal(text) {
  if (/christmas|xmas|holiday|santa|grinch/i.test(text)) return 'Christmas / holiday';
  if (/halloween|spooky/i.test(text)) return 'Halloween';
  if (/valentine/i.test(text)) return "Valentine's Day";
  return 'Evergreen (estimate)';
}

// Product name guess from the caption
function productName(caption) {
  let t = String(caption || '').replace(/https?:\/\/\S+/g, '').replace(/[#@]\w+/g, '').replace(/\s+/g, ' ').trim();
  t = t.split(/[.!?\n|]/).map(s => s.trim()).find(s => s.length >= 6) || t;
  t = t.replace(/^[^\w$]+/, '');
  if (!t) return 'Untitled video';
  return t.length > 60 ? t.slice(0, 57).trim() + '…' : t;
}

const STOP = new Set('the a an and or for to of in on with this that my your our is it its you i me we they them be are was were so just like get got new best viral must have need love omg wow when what how why who out up all from at by not no yes do does did can will one two'.split(' '));
function keywords(text) {
  return new Set(String(text || '').toLowerCase().replace(/[#@]/g, ' ').match(/[a-z]{4,}/g)?.filter(w => !STOP.has(w)) || []);
}

module.exports = { captionBait, classifyComments, captionLooksUS, detectNiche, seasonal, productName, keywords };
