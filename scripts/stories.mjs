// Story pool tooling (runs on your computer, not in the app).
//   node scripts/stories.mjs plan   -> scripts/story-plan.json (6 words per episode)
//   node scripts/stories.mjs check  -> validates src/data/stories.json, drops bad episodes
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { episodeProblems } from '../src/story.js';

const VOCAB = 'src/data/vocab-book.json';
const PLAN = 'scripts/story-plan.json';
const STORIES = 'src/data/stories.json';
const NEWS_VOCAB = 'src/data/news-vocab.json';
const PER_EPISODE = 6;

const vocab = JSON.parse(readFileSync(VOCAB, 'utf8'));
const cmd = process.argv[2];

if (cmd === 'plan') {
  // Sorted by category so most episodes stay on one topic.
  const words = [...vocab].sort((a, b) => a.category.localeCompare(b.category));
  const plan = [];
  for (let i = 0; i < words.length; i += PER_EPISODE) {
    plan.push({
      id: `ep${String(plan.length + 1).padStart(2, '0')}`,
      words: words.slice(i, i + PER_EPISODE).map(w => ({
        word: w.word,
        category: w.category,
        meanings: w.senses.map(s => s.zh)
      }))
    });
  }
  writeFileSync(PLAN, JSON.stringify(plan, null, 2) + '\n');
  console.log(`plan: ${plan.length} episodes -> ${PLAN}`);
} else if (cmd === 'check') {
  // Optional file arg, e.g. `check src/data/news-stories.json`.
  const file = process.argv[3] ?? STORIES;
  if (!existsSync(file)) throw new Error(`${file} not found`);
  const newsVocab = existsSync(NEWS_VOCAB) ? JSON.parse(readFileSync(NEWS_VOCAB, 'utf8')) : [];
  const known = new Set([...vocab, ...newsVocab].map(v => v.word.trim().toLowerCase()));
  const all = JSON.parse(readFileSync(file, 'utf8'));
  const STORIES_OUT = file;
  const good = [];
  for (const ep of all) {
    const p = episodeProblems(ep, known);
    if (p.length) console.log(`DROP ${ep?.id}: ${p.join('; ')}`);
    else good.push(ep);
  }
  const covered = new Set(good.flatMap(ep => ep.scenes.map(s => s.word.trim().toLowerCase())));
  writeFileSync(STORIES_OUT, JSON.stringify(good, null, 2) + '\n');
  console.log(`check: kept ${good.length}/${all.length} episodes, words covered ${covered.size}/${known.size}`);
  if (good.length === 0) process.exit(1);
} else if (cmd === 'check-vocab') {
  // News words must look like vocab-book entries and must not repeat a book word.
  const book = new Set(vocab.map(v => v.word.trim().toLowerCase()));
  const items = JSON.parse(readFileSync(NEWS_VOCAB, 'utf8'));
  const bad = [];
  const seen = new Set();
  for (const v of items) {
    const w = typeof v?.word === 'string' ? v.word.trim().toLowerCase() : '';
    const ok = w && !book.has(w) && !seen.has(w) &&
      ['Reading', 'Listening', 'Both'].includes(v.type) && v.category && v.pos &&
      Array.isArray(v.senses) && v.senses.length > 0 &&
      v.senses.every(s => s?.en && s?.zh && s?.example);
    if (!ok) bad.push(v?.word);
    seen.add(w);
  }
  console.log(bad.length ? `BAD news words: ${bad.join(', ')}` : `check-vocab: ${items.length} news words ok`);
  if (bad.length) process.exit(1);
} else {
  console.log('usage: node scripts/stories.mjs plan|check [file]|check-vocab');
  process.exit(1);
}
