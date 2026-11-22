import Dexie from 'dexie';
import { SEED_VOCABULARY } from './seedData.js';

// IndexedDB 資料庫定義
// 兩個 table:
//   vocab: 單字資料（取代 Firestore）
//   ttsCache: TTS 音檔快取（key = text + voice，value = base64 PCM）
export const db = new Dexie('ToeicMasterDB');

export function normalizeWord(word) {
  return typeof word === 'string' ? word.trim().toLowerCase() : '';
}

db.version(1).stores({
  // ++id 表示自動遞增的主鍵
  // word, type, status, timestamp 是索引欄位（可以快速查詢/排序）
  vocab: '++id, word, type, status, timestamp',
  // key 是主鍵（格式: "hello__Kore"）
  ttsCache: 'key, timestamp'
});

db.version(2).stores({
  vocab: '++id, word, normalizedWord, type, status, timestamp',
  ttsCache: 'key, timestamp'
}).upgrade(async tx => {
  const table = tx.table('vocab');
  const records = await table.toArray();
  const seen = new Set();
  const duplicateIds = [];
  const updates = [];

  for (const record of records) {
    const normalizedWord = normalizeWord(record.word);
    if (!normalizedWord || seen.has(normalizedWord)) {
      duplicateIds.push(record.id);
      continue;
    }
    seen.add(normalizedWord);
    if (record.normalizedWord !== normalizedWord) {
      updates.push({ ...record, normalizedWord });
    }
  }

  if (duplicateIds.length > 0) await table.bulkDelete(duplicateIds);
  if (updates.length > 0) await table.bulkPut(updates);
});

db.version(3).stores({
  vocab: '++id, &normalizedWord, word, type, status, timestamp',
  ttsCache: 'key, timestamp'
});

// v4: migrate flat en/zh/sent fields to senses array
db.version(4).stores({
  vocab: '++id, &normalizedWord, word, type, status, timestamp',
  ttsCache: 'key, timestamp'
}).upgrade(async tx => {
  const table = tx.table('vocab');
  const records = await table.toArray();
  const updates = [];
  for (const record of records) {
    if (!Array.isArray(record.senses)) {
      updates.push({
        ...record,
        senses: [{
          en: record.en ?? '',
          zh: record.zh ?? '',
          example: record.sent ?? ''
        }]
      });
    }
  }
  if (updates.length > 0) await table.bulkPut(updates);
});

// v5: story mode — which episodes are finished (vocab gets non-indexed missCount/lastSeen)
db.version(5).stores({
  vocab: '++id, &normalizedWord, word, type, status, timestamp',
  ttsCache: 'key, timestamp',
  storyDone: 'id'
});

export const storyDb = {
  async doneIds() {
    return (await db.storyDone.toArray()).map(r => r.id);
  },
  async markDone(id) {
    await db.storyDone.put({ id, at: Date.now() });
  },
  async resetDone() {
    await db.storyDone.clear();
  },
  // Apply fn(oldRecord) -> fields to the vocab record for this word, if it exists.
  async updateWord(word, fn) {
    const record = await db.vocab.where('normalizedWord').equals(normalizeWord(word)).first();
    if (record) await db.vocab.update(record.id, fn(record));
  }
};

function isConstraintError(error) {
  if (!error) return false;
  if (error.name === 'ConstraintError') return true;
  return error.name === 'BulkError' && error.failures?.every(isConstraintError);
}

// --- Vocab 操作 ---
export const vocabDb = {
  async getAll() {
    return await db.vocab.orderBy('timestamp').reverse().toArray();
  },

  async addMany(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return { added: 0, skipped: 0, skippedWords: [] };
    }

    // 同一批內部也可能有重複（例如 AI 不小心生兩個一樣），用 Map 以單字為 key 去重
    const seenInBatch = new Set();
    const toInsert = [];
    const skippedWords = [];

    for (const item of items) {
      const key = normalizeWord(item?.word);
      if (!key) continue; // 跳過沒有 word 欄位的
      if (seenInBatch.has(key)) {
        skippedWords.push(item.word);
        continue;
      }
      seenInBatch.add(key);
      toInsert.push({ ...item, word: item.word.trim(), normalizedWord: key });
    }

    if (toInsert.length === 0) {
      return { added: 0, skipped: skippedWords.length, skippedWords };
    }

    const now = Date.now();
    const records = toInsert.map((item, i) => ({
      ...item,
      status: false,
      // 用 now + i 確保同一批加入的單字有細微時間差，排序穩定
      timestamp: now + i
    }));

    let added = 0;
    await db.transaction('rw', db.vocab, async () => {
      for (const record of records) {
        try {
          await db.vocab.bulkAdd([record]);
          added++;
        } catch (error) {
          if (!isConstraintError(error)) throw error;
          skippedWords.push(record.word);
        }
      }
    });

    return { added, skipped: skippedWords.length, skippedWords };
  },

  async toggleStatus(id, newStatus) {
    await db.vocab.update(id, { status: newStatus });
  },

  async remove(id) {
    await db.vocab.delete(id);
  },

  async clearAll() {
    await db.vocab.clear();
  },

  async getWordList() {
    // 給 AI prompt 用，避免生成重複單字
    const all = await db.vocab.toArray();
    return all.map(v => v.word);
  },

  // 首次開啟 App 時若資料庫空的，自動塞入種子資料
  // 只執行一次，之後即使使用者刪光也不會再自動加回
  async seedIfEmpty() {
    const hasSeeded = localStorage.getItem('toeic_master_seeded');
    if (!hasSeeded) {
      const count = await db.vocab.count();
      if (count > 0) {
        localStorage.setItem('toeic_master_seeded', '1');
        return false;
      }
      const { added } = await this.addMany(SEED_VOCABULARY);
      localStorage.setItem('toeic_master_seeded', '1');
      return added > 0;
    }
    return false;
  },

  // 每次開 App：把還沒匯入過的新聞單字加進單字本。
  // 匯入過的字記在 localStorage，使用者之後刪掉也不會再加回來。回傳新增數。
  async importNews(items) {
    const KEY = 'toeic_master_news_imported';
    let done;
    try {
      done = new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
    } catch {
      done = new Set();
    }
    const fresh = items.filter(item => !done.has(normalizeWord(item.word)));
    if (fresh.length === 0) return 0;
    const { added } = await this.addMany(fresh);
    fresh.forEach(item => done.add(normalizeWord(item.word)));
    try {
      localStorage.setItem(KEY, JSON.stringify([...done]));
    } catch {
      // storage blocked: words may be offered again next time, addMany dedups anyway
    }
    return added;
  },

  // 手動匯入範例單字（按鈕用）
  // 回傳 { added, skipped, skippedWords }
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
