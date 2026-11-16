# Banger Radar 📡

Finds fresh, unsaturated, US-ready dropshipping products from Instagram, Facebook and TikTok.

## Hard rules (a video must pass all 3)
1. **Brand-new page:** the oldest post on the page is 7 days old or newer
2. **Not saturated:** 10 or fewer copycat pages + US advertisers
3. **100% US:** at least 60% of comments look like a US audience

## Banger % (0-100)
Buy intent 25 · Engagement 20 · Velocity 15 · New page boost 15 · Low saturation 10 · Margin 10 · Wow factor 5, minus a penalty for red-flag comments.
80+ = 🔥 Banger · 60-79 = 👀 Worth testing · under 60 = skip.

Rules and weights live in `score.js`.

## Run
```
npm start
```
No dependencies. Deploys on Railway as-is.

Right now the feed uses sample data (`sample.js`). Next step: connect Apify scrapers + the Claude API for comment analysis.
