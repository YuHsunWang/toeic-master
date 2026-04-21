import { ttsCacheDb } from './db.js';

// ============================================================
// 語音服務：三層 fallback
//   1. IndexedDB 快取（最快、離線可用）
//   2. Gemini TTS API（線上，音質最好，會寫入快取）
//   3. 瀏覽器內建 SpeechSynthesis（離線 fallback，音質普通但免費）
// ============================================================

// PCM (24kHz, 16-bit mono) → WAV Blob
// Gemini TTS 回傳的是裸 PCM，瀏覽器不能直接播，要包上 WAV header
function pcmToWav(base64Pcm, sampleRate = 24000) {
  const binaryString = window.atob(base64Pcm);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

  const wavBuffer = new ArrayBuffer(44 + bytes.length);
  const view = new DataView(wavBuffer);
  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + bytes.length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);          // PCM format
  view.setUint16(22, 1, true);          // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);         // 16-bit
  writeString(36, 'data');
  view.setUint32(40, bytes.length, true);
  new Uint8Array(wavBuffer, 44).set(bytes);

  return new Blob([wavBuffer], { type: 'audio/wav' });
}

// 指數退避呼叫 Gemini TTS API
async function fetchGeminiTTS(text, apiKey, retries = 3) {
  let delay = 1000;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text }] }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
              }
            }
          })
        }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      const pcmBase64 = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!pcmBase64) throw new Error('No audio in response');
      return pcmBase64;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

// 播放 base64 PCM 音檔
function playPcm(pcmBase64) {
  return new Promise((resolve, reject) => {
    const audioBlob = pcmToWav(pcmBase64, 24000);
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      resolve();
    };
    audio.onerror = (e) => {
      URL.revokeObjectURL(audioUrl);
      reject(e);
    };
    audio.play().catch(reject);
  });
}

// 瀏覽器內建 TTS（離線 fallback）
function speakWithBrowser(text) {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) {
      return reject(new Error('Browser does not support SpeechSynthesis'));
    }
    // 有些瀏覽器要先 cancel 前一個才不會卡住
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    // 優先挑英文語音
    const voices = window.speechSynthesis.getVoices();
    const enVoice = voices.find(v => v.lang.startsWith('en'));
    if (enVoice) utterance.voice = enVoice;

    utterance.onend = () => resolve();
    utterance.onerror = (e) => reject(e);
    window.speechSynthesis.speak(utterance);
  });
}

// 主入口：三層 fallback 邏輯
// 回傳 { source: 'cache' | 'gemini' | 'browser' }，讓 UI 可以顯示音源資訊
export async function speak(text, apiKey) {
  // 第 1 層：快取
  const cached = await ttsCacheDb.get(text);
  if (cached) {
    await playPcm(cached);
    return { source: 'cache' };
  }

  // 第 2 層：線上時呼叫 Gemini
  if (navigator.onLine && apiKey) {
    try {
      const pcmBase64 = await fetchGeminiTTS(text, apiKey);
      // 先播，再背景寫入快取（這樣即使寫入失敗也不影響播放體驗）
      await playPcm(pcmBase64);
      ttsCacheDb.set(text, pcmBase64).catch(err =>
        console.warn('[TTS] Failed to cache:', err)
      );
      return { source: 'gemini' };
    } catch (e) {
      console.warn('[TTS] Gemini failed, falling back to browser:', e);
      // 繼續往下掉到瀏覽器內建
    }
  }

  // 第 3 層：瀏覽器內建
  await speakWithBrowser(text);
  return { source: 'browser' };
}

// 預熱快取：一次把所有還沒快取的單字都呼叫 Gemini 生成並存起來
// 這樣使用者在有網路時可以按一下「全部預載」，之後就能完全離線使用
export async function preloadTTS(texts, apiKey, onProgress) {
  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const text of texts) {
    const cached = await ttsCacheDb.get(text);
    if (cached) {
      skipped++;
      done++;
      onProgress?.({ done, total: texts.length, skipped, failed });
      continue;
    }
    try {
      const pcmBase64 = await fetchGeminiTTS(text, apiKey);
      await ttsCacheDb.set(text, pcmBase64);
    } catch (e) {
      failed++;
      console.warn('[TTS preload] Failed for:', text, e);
    }
    done++;
    onProgress?.({ done, total: texts.length, skipped, failed });
    // 小小 delay 避免打爆 API rate limit
    await new Promise(r => setTimeout(r, 200));
  }

  return { done, skipped, failed };
}
