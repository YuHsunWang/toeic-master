// node scripts/story.test.mjs — self-check for src/story.js
import assert from 'node:assert/strict';
import { episodeProblems, pickNextEpisode, nextWordProgress } from '../src/story.js';

const email = {
  kind: 'email', word: 'verify', from: 'Ms. Chen', setup: '主管寄信',
  text: 'Please ____ the invoice before Friday.',
  options: ['verify', 'postpone', 'reimburse'], answer: 'verify',
  rescue: { reaction: 'Checked, not delayed.', options: ['verify', 'reimburse'], answer: 'verify' }
};
const call = {
  kind: 'call', word: 'shipment', from: 'Ms. Ortiz', setup: '客戶來電',
  text: 'Our shipments are late.', question: '對方想要什麼？',
  options: ['查貨', '開會', '報價'], answer: '查貨',
  rescue: { reaction: 'Where is the package?', options: ['查貨', '報價'], answer: '查貨' }
};
const known = new Set(['verify', 'shipment']);
const ep = (id, scenes) => ({ id, title: 't', ending: 'e', scenes });
const good = ep('ep01', [email, call, email, call]);

assert.deepEqual(episodeProblems(good, known), [], 'valid episode passes');
// Wrong answers must be caught, or the player is told a wrong word is right.
assert.ok(episodeProblems(ep('x', [{ ...email, answer: 'postpone', rescue: { ...email.rescue, answer: 'postpone', options: ['postpone', 'verify'] }, options: ['verify', 'postpone', 'reimburse'] }, call, email, call]), known).length, 'answer must be a form of the word');
assert.ok(episodeProblems(ep('x', [{ ...email, text: 'Please ____ and ____.' }, call, email, call]), known).length, 'exactly one blank');
assert.ok(episodeProblems(ep('x', [{ ...call, text: 'Hello there.' }, call, email, call]), known).length, 'call must contain the word');
assert.ok(episodeProblems(ep('x', [email, email, email, email]), known).length, 'needs both kinds');
assert.ok(episodeProblems(good, new Set(['verify'])).length, 'word must be in vocab book');
// AI-style wording teaches the player machine English, so it must be rejected...
assert.ok(episodeProblems(ep('x', [{ ...email, text: 'Please ____ the invoice — we must leverage it.' }, call, email, call]), known).length, 'AI tells rejected');
// ...unless the tell IS the word being tested.
assert.deepEqual(episodeProblems(ep('x', [{ ...email, word: 'leverage', text: 'We can ____ our size.', options: ['leverage', 'postpone', 'reimburse'], answer: 'leverage', rescue: { ...email.rescue, options: ['leverage', 'reimburse'], answer: 'leverage' } }, call, email, call]), new Set([...known, 'leverage'])), [], 'tested word exempt');

// Picker: the episode with your missed word wins over an untouched one.
const vocab = [
  { word: 'verify', status: false, lastSeen: 1, missCount: 2 },
  { word: 'shipment', status: false, lastSeen: 1, missCount: 0 }
];
const a = ep('a', [call, call]);
const b = ep('b', [email]);
assert.equal(pickNextEpisode([a, b], vocab, []).id, 'b');
assert.equal(pickNextEpisode([a, b], vocab, ['b']).id, 'a', 'skips done episodes');
assert.equal(pickNextEpisode([a, b], vocab, ['a', 'b']), null);

assert.deepEqual(nextWordProgress({ missCount: 1 }, true, 5), { missCount: 0, lastSeen: 5 });
assert.deepEqual(nextWordProgress({}, false, 5), { missCount: 1, lastSeen: 5 });
console.log('story.test: all passed');
