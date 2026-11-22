// Story mode: pure logic shared by the app and scripts/check-stories.mjs.
import { makeSentenceBlank } from './quiz.js';

export const BLANK = '____';
const SCENE_KINDS = new Set(['email', 'call']);

function str(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function choiceSet(options, answer, size) {
  if (!Array.isArray(options) || options.length !== size) return false;
  const clean = options.map(str);
  if (clean.some(o => !o)) return false;
  if (new Set(clean.map(o => o.toLowerCase())).size !== size) return false;
  return clean.includes(str(answer));
}

// Returns a list of problems; empty list = scene is usable.
export function sceneProblems(scene, word) {
  const p = [];
  if (!SCENE_KINDS.has(scene?.kind)) p.push('bad kind');
  if (!str(scene?.text)) p.push('no text');
  if (!str(scene?.setup)) p.push('no setup');
  if (!choiceSet(scene?.options, scene?.answer, 3)) p.push('options must be 3 unique and include answer');
  const r = scene?.rescue;
  if (!str(r?.reaction)) p.push('no rescue.reaction');
  if (!choiceSet(r?.options, r?.answer, 2)) p.push('rescue options must be 2 unique and include answer');
  if (p.length) return p;

  if (scene.kind === 'email') {
    if (scene.text.split(BLANK).length !== 2) p.push(`email text needs exactly one ${BLANK}`);
    else if (!makeSentenceBlank(scene.text.replace(BLANK, scene.answer), word)) p.push('answer is not a form of the word');
    if (r.answer !== scene.answer) p.push('email rescue answer must equal answer');
  } else {
    if (!str(scene.question)) p.push('call needs question');
    if (!makeSentenceBlank(scene.text, word)) p.push('call text must contain the word');
  }
  return p;
}

// knownWords: Set of normalized words that exist in the vocab book.
export function episodeProblems(ep, knownWords) {
  const p = [];
  if (!str(ep?.id)) p.push('no id');
  if (!str(ep?.title)) p.push('no title');
  if (!str(ep?.ending)) p.push('no ending');
  if (!Array.isArray(ep?.scenes) || ep.scenes.length < 4) return [...p, 'needs at least 4 scenes'];
  const kinds = new Set();
  ep.scenes.forEach((s, i) => {
    const w = normalizeWord(s?.word);
    if (!knownWords.has(w)) p.push(`scene ${i + 1}: word "${s?.word}" not in vocab book`);
    for (const e of sceneProblems(s, w)) p.push(`scene ${i + 1}: ${e}`);
    kinds.add(s?.kind);
  });
  if (!kinds.has('email') || !kinds.has('call')) p.push('needs both email and call scenes');
  return p;
}

export function validEpisodes(episodes, vocabulary) {
  const known = new Set(vocabulary.map(v => normalizeWord(v.word)));
  return (Array.isArray(episodes) ? episodes : []).filter(ep => episodeProblems(ep, known).length === 0);
}

// Pick the unplayed episode whose words you need most.
// Weight: each past miss = 3, never practiced = 1, mastered = 0.
export function pickNextEpisode(episodes, vocabulary, doneIds) {
  const byWord = new Map(vocabulary.map(v => [normalizeWord(v.word), v]));
  const done = new Set(doneIds);
  let best = null;
  let bestScore = -1;
  for (const ep of episodes) {
    if (done.has(ep.id)) continue;
    let score = 0;
    for (const s of ep.scenes) {
      const v = byWord.get(normalizeWord(s.word));
      if (!v) continue;
      score += (v.missCount ?? 0) * 3;
      if (!v.lastSeen && !v.status) score += 1;
    }
    if (score > bestScore) {
      best = ep;
      bestScore = score;
    }
  }
  return best;
}

// New progress fields for a word after one scene. firstTry = answered right the first time.
export function nextWordProgress(v, firstTry, now = Date.now()) {
  const miss = v?.missCount ?? 0;
  return { missCount: firstTry ? Math.max(0, miss - 1) : miss + 1, lastSeen: now };
}

function normalizeWord(word) {
  return typeof word === 'string' ? word.trim().toLowerCase() : '';
}
