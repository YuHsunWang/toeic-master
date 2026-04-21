import Dexie from 'dexie';
import { SEED_VOCABULARY } from './seedData.js';

// IndexedDB 資料庫定義
// 兩個 table:
//   vocab: 單字資料（取代 Firestore）
//   ttsCache: TTS 音檔快取（key = text + voice，value = base64 PCM）
export const db = new Dexie('ToeicMasterDB');

db.version(1).stores({
  // ++id 表示自動遞增的主鍵
  // word, type, status, timestamp 是索引欄位（可以快速查詢/排序）
  vocab: '++id, word, type, status, timestamp',
  // key 是主鍵（格式: "hello__Kore"）
  ttsCache: 'key, timestamp'
});

// --- Vocab 操作 ---
export const vocabDb = {
  async getAll() {
    return await db.vocab.orderBy('timestamp').reverse().toArray();
  },

  async addMany(items) {
    if (!items || items.length === 0) return { added: 0, skipped: 0, skippedWords: [] };

    // 取得資料庫中現有的所有單字（轉小寫去頭尾空白，做不敏感比對）
    const existingWords = await db.vocab.toArray();
    const existingSet = new Set(
      existingWords.map(v => (v.word || '').trim().toLowerCase())
    );

    // 同一批內部也可能有重複（例如 AI 不小心生兩個一樣），用 Map 以單字為 key 去重
    const seenInBatch = new Set();
    const toInsert = [];
    const skippedWords = [];

    for (const item of items) {
      const key = (item.word || '').trim().toLowerCase();
      if (!key) continue; // 跳過沒有 word 欄位的
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
      // 用 now + i 確保同一批加入的單字有細微時間差，排序穩定
      timestamp: now + i
    }));
    await db.vocab.bulkAdd(records);

    return { added: records.length, skipped: skippedWords.length, skippedWords };
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
    const count = await db.vocab.count();
    const hasSeeded = localStorage.getItem('toeic_master_seeded');
    if (count === 0 && !hasSeeded) {
      await this.addMany(SEED_VOCABULARY);
      localStorage.setItem('toeic_master_seeded', '1');
      return true;
    }
    return false;
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
