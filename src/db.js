import Dexie from 'dexie';
import { SEED_VOCABULARY } from './seedData.js';

export const db = new Dexie('ToeicMasterDB');

db.version(1).stores({
  vocab: '++id, word, type, status, timestamp',
  ttsCache: 'key, timestamp'
});

// 新增 nextReview, srLevel 兩個索引欄位
db.version(2).stores({
  vocab: '++id, word, type, status, timestamp, nextReview, srLevel',
  ttsCache: 'key, timestamp'
});

// 間隔重複的複習間隔天數（依等級 0~5）
// 0=新字, 1=1天, 2=3天, 3=7天, 4=14天, 5=30天
const SR_INTERVALS = [0, 1, 3, 7, 14, 30];

function nextReviewDate(level) {
  const days = SR_INTERVALS[Math.min(level, SR_INTERVALS.length - 1)];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

// --- Vocab 操作 ---
export const vocabDb = {
  async getAll() {
    return await db.vocab.orderBy('timestamp').reverse().toArray();
  },

  async getDueToday() {
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    return await db.vocab
      .where('nextReview')
      .belowOrEqual(todayEnd.getTime())
      .toArray();
  },

  async addMany(items) {
    if (!items || items.length === 0) return { added: 0, skipped: 0, skippedWords: [] };

    const existingWords = await db.vocab.toArray();
    const existingSet = new Set(
      existingWords.map(v => (v.word || '').trim().toLowerCase())
    );

    const seenInBatch = new Set();
    const toInsert = [];
    const skippedWords = [];

    for (const item of items) {
      const key = (item.word || '').trim().toLowerCase();
      if (!key) continue;
      if (existingSet.has(key) || seenInBatch.has(key)) {
        skippedWords.push(item.word);
        continue;
      }
      seenInBatch.add(key);
      toInsert.push(item);
    }

    if (toInsert.length === 0) {
      return { added: 0, skipped: skippedWords.length, skippedWords };
    }

    const now = Date.now();
    const records = toInsert.map((item, i) => ({
      ...item,
      status: false,
      timestamp: now + i,
      srLevel: 0,
      nextReview: now + i
    }));
    await db.vocab.bulkAdd(records);

    return { added: records.length, skipped: skippedWords.length, skippedWords };
  },

  async toggleStatus(id, newStatus) {
    await db.vocab.update(id, { status: newStatus });
  },

  // 間隔重複回答：correct=true 升級, false 重置到等級1
  async recordReview(id, correct) {
    const item = await db.vocab.get(id);
    if (!item) return;
    const newLevel = correct ? Math.min((item.srLevel || 0) + 1, SR_INTERVALS.length - 1) : 1;
    const updates = {
      srLevel: newLevel,
      nextReview: nextReviewDate(newLevel),
      lastReviewed: Date.now()
    };
    if (newLevel >= SR_INTERVALS.length - 1) updates.status = true;
    await db.vocab.update(id, updates);
  },

  async remove(id) {
    await db.vocab.delete(id);
  },

  async clearAll() {
    await db.vocab.clear();
  },

  async getWordList() {
    const all = await db.vocab.toArray();
    return all.map(v => v.word);
  },

  async seedIfEmpty() {
    const count = await db.vocab.count();
    const hasSeeded = localStorage.getItem('toeic_master_seeded');
    if (count === 0 && !hasSeeded) {
      await this.addMany(SEED_VOCABULARY);
      localStorage.setItem('toeic_master_seeded', '1');
      return true;
    }
    return false;
  },

  async importSeed() {
    return await this.addMany(SEED_VOCABULARY);
  }
};

// --- TTS 快取操作 ---
export const ttsCacheDb = {
  _key(text, voice = 'Kore') {
    return `${text}__${voice}`;
  },

  async get(text, voice = 'Kore') {
    const record = await db.ttsCache.get(this._key(text, voice));
    return record?.pcmBase64 ?? null;
  },

  async set(text, pcmBase64, voice = 'Kore') {
    await db.ttsCache.put({
      key: this._key(text, voice),
      pcmBase64,
      timestamp: Date.now()
    });
  },

  async size() {
    return await db.ttsCache.count();
  },

  async clear() {
    await db.ttsCache.clear();
  }
};
