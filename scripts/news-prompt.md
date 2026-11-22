# Task: this week's news episodes (re-run weekly)

Needs live web search. Read `scripts/story-prompt.md` first: the world, cast and scene format there apply here too.

## 1. Fetch articles -> `news/articles.json` (git-ignored, personal use only)
- Find 2 CNN Business articles (cnn.com/business or edition.cnn.com/business) published in the last 7 days that touch normal office life: trade, prices, hiring, companies, shipping, travel, tech at work. Skip politics-only, crime, disaster stories.
- Skip any URL already in `news/articles.json`.
- Append one object per article (create the file as `[]` if missing):
  `{ "id": "news-YYYYMMDD-N", "source": "CNN", "url": "...", "headline": "...", "date": "YYYY-MM-DD", "text": "full article body as plain text, paragraphs separated by \n\n" }`
- If an article cannot be fetched in full, pick another. If CNN cannot be reached at all, stop and say so.

## 2. New words -> append to `src/data/news-vocab.json` (create as `[]` if missing)
- From those articles pick 5-8 words in total, TOEIC level (CEFR B1-B2), useful at work, that appear in the article.
- A word must NOT already be in `src/data/vocab-book.json` or `src/data/news-vocab.json`.
- Same shape as `src/data/vocab-book.json` entries, plus `"news": "<article id>"`:
  `{ "word", "ipa", "pos", "category" (one of the 12 categories already used in vocab-book.json), "type": "Reading"|"Listening"|"Both", "freqListening": 1-5, "freqReading": 1-5, "senses": [{ "en", "zh" (Traditional Chinese), "example" }], "news": "news-YYYYMMDD-N" }`
- Write your own example sentences. Do not copy sentences from the article.

## 3. Episodes -> append to `src/data/news-stories.json` (create as `[]` if missing)
- One episode per article: Harbor & Pine Trading has to deal with what the news describes (e.g. a tariff change -> a client calls about new prices).
- Same episode/scene format as `scripts/story-prompt.md`, id = the article id, plus:
  `"news": { "id", "source", "url", "headline", "date" }`
- 4-6 scenes. Every new word from this article is the `word` of at least one scene. Other scenes may use words from `src/data/vocab-book.json`.
- Use both email and call scenes. Do not copy sentences from the article.

## 4. Check
Run both, fix and re-run until they pass (check rewrites the file and drops bad episodes, so keep your own copy):
- `node scripts/stories.mjs check-vocab`
- `node scripts/stories.mjs check src/data/news-stories.json`

Only touch `news/articles.json`, `src/data/news-vocab.json`, `src/data/news-stories.json`.
