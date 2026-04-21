import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CheckCircle2,
  Search,
  Zap,
  RefreshCw,
  Headphones,
  Sparkles,
  Volume2,
  PlayCircle,
  Loader2,
  Info,
  Eye,
  Ear,
  Wifi,
  WifiOff,
  Download,
  BookPlus
} from 'lucide-react';

import { vocabDb, ttsCacheDb } from './db.js';
import { speak, preloadTTS } from './speechService.js';

// ============================================================
// 設定 API key
// 開發時：建立 .env.local 寫 VITE_GEMINI_API_KEY=你的key
// 離線功能不需要 key，但生成新單字和高音質 TTS 需要
// ============================================================
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

export default function App() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentlySpeaking, setCurrentlySpeaking] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState(null);
  const [filterType, setFilterType] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [preloadProgress, setPreloadProgress] = useState(null);

  // useLiveQuery: 資料變動時自動重新渲染，類似 Firestore 的 onSnapshot
  // undefined = 載入中，[] = 空陣列
  const vocabulary = useLiveQuery(() => vocabDb.getAll(), []);
  const cacheSize = useLiveQuery(() => ttsCacheDb.size(), [], 0);
  const loading = vocabulary === undefined;

  // 監聽連線狀態
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // 首次開啟 App 自動塞入種子單字（讓沒 API key 的使用者也有東西可用）
  useEffect(() => {
    vocabDb.seedIfEmpty().then(seeded => {
      if (seeded) flashMessage('已匯入 8 個範例單字，開始學習吧！', 3500);
    });
  }, []);

  // 顯示短暫提示訊息
  const flashMessage = (text, duration = 3000) => {
    setMessage(text);
    setTimeout(() => setMessage(null), duration);
  };

  // 播放發音
  const handleSpeak = async (text, id) => {
    if (currentlySpeaking) return;
    setCurrentlySpeaking(id);
    try {
      const { source } = await speak(text, GEMINI_API_KEY);
      // 如果是用瀏覽器內建語音，給個小提示（只在離線時顯示，免得太煩）
      if (source === 'browser' && !isOnline) {
        flashMessage('離線模式：使用內建語音', 1500);
      }
    } catch (e) {
      console.error(e);
      flashMessage('語音播放失敗');
    } finally {
      setCurrentlySpeaking(null);
    }
  };

  // AI 生成一批新單字
  const generateNewBatchWithAI = async () => {
    if (isGenerating) return;
    if (!isOnline) return flashMessage('離線狀態無法生成新單字');
    if (!GEMINI_API_KEY) return flashMessage('請先設定 Gemini API Key');

    setIsGenerating(true);
    setMessage('AI 正在分析多益常考單字...');

    try {
      const existingWords = (await vocabDb.getWordList()).join(', ');
      const systemPrompt = `你是一位專業的多益老師。請生成 10 個高品質的多益核心單字。
JSON 陣列格式，欄位：word, ipa, pos, zh, en, sent, category, type(Reading/Listening/Both)。
不要包含：${existingWords}。
type 欄位請標註該單字在多益中更傾向於閱讀(Reading)、聽力(Listening)還是兩者皆有(Both)。`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: '生成 10 個核心單字' }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { responseMimeType: 'application/json' }
          })
        }
      );
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const newWords = JSON.parse(text);

      const { added, skipped } = await vocabDb.addMany(newWords);
      if (added === 0) {
        flashMessage(`AI 生成的 ${skipped} 個單字都已存在，請再試一次`);
      } else if (skipped > 0) {
        flashMessage(`新增 ${added} 個單字（${skipped} 個重複已跳過）`);
      } else {
        flashMessage(`新增 ${added} 個單字！`);
      }
    } catch (err) {
      console.error(err);
      flashMessage('生成失敗，請檢查 API Key 或網路');
    } finally {
      setIsGenerating(false);
    }
  };

  // 預載所有單字發音到快取（讓使用者可以完全離線使用）
  const handlePreloadTTS = async () => {
    if (!isOnline) return flashMessage('需要網路才能預載發音');
    if (!GEMINI_API_KEY) return flashMessage('請先設定 Gemini API Key');
    if (!vocabulary || vocabulary.length === 0) return;

    // 收集所有要生成的文字（單字 + 例句）
    const texts = [];
    for (const v of vocabulary) {
      texts.push(v.word);
      if (v.sent) texts.push(v.sent);
    }

    setPreloadProgress({ done: 0, total: texts.length });
    try {
      const result = await preloadTTS(texts, GEMINI_API_KEY, (progress) => {
        setPreloadProgress(progress);
      });
      flashMessage(`預載完成：成功 ${result.done - result.failed}，跳過 ${result.skipped}`);
    } catch (e) {
      flashMessage('預載過程發生錯誤');
    } finally {
      setPreloadProgress(null);
    }
  };

  const toggleMastery = async (item) => {
    await vocabDb.toggleStatus(item.id, !item.status);
  };

  // 手動匯入範例單字（沒 API key 時的替代方案）
  const handleImportSeed = async () => {
    const { added, skipped } = await vocabDb.importSeed();
    if (added === 0 && skipped > 0) {
      flashMessage(`範例單字都已在單字本中（${skipped} 個跳過）`);
    } else if (skipped > 0) {
      flashMessage(`新增 ${added} 個，跳過 ${skipped} 個重複`);
    } else {
      flashMessage(`已匯入 ${added} 個範例單字`);
    }
  };

  const filteredItems = useMemo(() => {
    if (!vocabulary) return [];
    return vocabulary.filter(v => {
      const matchesSearch =
        v.word.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.zh && v.zh.includes(searchTerm));
      const matchesType = filterType === 'All' || v.type === filterType;
      const matchesStatus =
        filterStatus === 'All' ? true : filterStatus === 'Mastered' ? v.status : !v.status;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [vocabulary, searchTerm, filterType, filterStatus]);

  const stats = {
    total: vocabulary?.length ?? 0,
    mastered: vocabulary?.filter(v => v.status).length ?? 0,
    learning: vocabulary?.filter(v => !v.status).length ?? 0,
    percent: vocabulary?.length
      ? Math.round((vocabulary.filter(v => v.status).length / vocabulary.length) * 100)
      : 0
  };

  const TypeBadge = ({ type }) => {
    const configs = {
      Reading: {
        color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        icon: <Eye className="w-3 h-3" />,
        label: '閱讀'
      },
      Listening: {
        color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        icon: <Ear className="w-3 h-3" />,
        label: '聽力'
      },
      Both: {
        color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
        icon: <Zap className="w-3 h-3" />,
        label: '雙棲'
      }
    };
    const config = configs[type] || configs.Both;
    return (
      <div
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${config.color}`}
      >
        {config.icon}
        {config.label}
      </div>
    );
  };

  if (loading)
    return (
      <div className="h-screen bg-[#07090F] flex flex-col items-center justify-center gap-6">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
        <p className="text-indigo-400 font-bold tracking-[0.2em] text-[10px] uppercase">
          Booting Master System...
        </p>
      </div>
    );

  return (
    <div className="min-h-screen bg-[#07090F] text-slate-200 p-5 pb-20 selection:bg-indigo-500 selection:text-white">
      <div className="max-w-xl mx-auto pt-4 mb-8">
        <header className="flex justify-between items-end mb-8">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-3 rounded-2xl shadow-xl shadow-indigo-600/20 rotate-3">
              <Headphones className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white leading-none italic uppercase tracking-tighter">
                TOEIC <span className="text-indigo-500">Master</span>
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                  Active Learning Engine
                </p>
                {/* 線上/離線指示器 */}
                {isOnline ? (
                  <span className="flex items-center gap-1 text-[9px] font-black text-emerald-400 uppercase">
                    <Wifi className="w-3 h-3" /> On
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[9px] font-black text-amber-400 uppercase">
                    <WifiOff className="w-3 h-3" /> Off
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="bg-white/5 border border-white/5 px-4 py-2 rounded-xl text-right">
            <p className="text-xs font-black text-slate-500 uppercase mb-0.5">Mastery Rate</p>
            <p className="text-xl font-black text-indigo-400 leading-none">{stats.percent}%</p>
          </div>
        </header>

        <button
          onClick={generateNewBatchWithAI}
          disabled={isGenerating || !isOnline}
          className="w-full mb-4 relative group overflow-hidden disabled:opacity-40"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-sky-600 opacity-90 transition-transform group-hover:scale-105" />
          <div className="relative flex items-center justify-center gap-4 py-5 rounded-3xl font-black text-sm tracking-widest uppercase text-white shadow-2xl">
            {isGenerating ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Sparkles className="w-5 h-5 animate-bounce" />
            )}
            {isGenerating ? 'Analyzing...' : '獲取 AI 新單字'}
          </div>
        </button>

        {/* 匯入範例單字（沒 API key 時的替代方案） */}
        <button
          onClick={handleImportSeed}
          className="w-full mb-4 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:bg-emerald-500/20 transition-all flex items-center justify-center gap-2"
        >
          <BookPlus className="w-4 h-4" />
          匯入 8 個範例單字（免 API Key）
        </button>

        {/* 預載發音按鈕 */}
        <button
          onClick={handlePreloadTTS}
          disabled={!isOnline || !!preloadProgress || stats.total === 0}
          className="w-full mb-8 py-3 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-slate-300 hover:bg-white/10 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
        >
          {preloadProgress ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              預載中 {preloadProgress.done}/{preloadProgress.total}
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              預載發音供離線使用（已快取 {cacheSize} 筆）
            </>
          )}
        </button>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-slate-900/40 border border-white/5 p-4 rounded-3xl flex flex-col items-center">
            <span className="text-[10px] font-black text-slate-600 uppercase mb-1">
              已掌握 (Mastered)
            </span>
            <span className="text-2xl font-black text-indigo-400">{stats.mastered}</span>
          </div>
          <div className="bg-slate-900/40 border border-white/5 p-4 rounded-3xl flex flex-col items-center">
            <span className="text-[10px] font-black text-slate-600 uppercase mb-1">
              學習中 (Learning)
            </span>
            <span className="text-2xl font-black text-emerald-400">{stats.learning}</span>
          </div>
        </div>

        <div className="space-y-4 mb-8">
          <div className="relative">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600" />
            <input
              type="text"
              placeholder="搜尋單字或翻譯..."
              className="w-full bg-slate-900/50 border border-white/5 rounded-2xl py-4 pl-16 pr-6 font-bold focus:border-indigo-500 outline-none transition-all placeholder:text-slate-700"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {['All', 'Reading', 'Listening', 'Both'].map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap border transition-all ${
                  filterType === t
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                    : 'bg-slate-900/50 border-white/5 text-slate-500'
                }`}
              >
                {t === 'All' ? '全部類別' : t}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            {['All', 'Learning', 'Mastered'].map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                  filterStatus === s
                    ? 'bg-white/10 border-white/20 text-white'
                    : 'bg-slate-900/20 border-transparent text-slate-600'
                }`}
              >
                {s === 'All' ? '全部狀態' : s === 'Learning' ? '學習中' : '已掌握'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto space-y-6">
        {filteredItems.map(item => (
          <div
            key={item.id}
            className={`group p-8 rounded-[2.5rem] border transition-all relative overflow-hidden ${
              item.status
                ? 'bg-slate-900/30 border-transparent grayscale-[0.6] opacity-60'
                : 'bg-slate-900/80 border-white/5 hover:border-indigo-500/30 shadow-xl'
            }`}
          >
            <div
              className={`absolute top-0 right-0 px-6 py-1.5 rounded-bl-3xl text-[9px] font-black uppercase tracking-[0.2em] ${
                item.status
                  ? 'bg-indigo-500 text-white'
                  : 'bg-emerald-500 text-white animate-pulse'
              }`}
            >
              {item.status ? 'Mastered' : 'Learning'}
            </div>

            <div className="flex justify-between items-start mb-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-3xl font-black text-white group-hover:text-indigo-400 transition-colors tracking-tight">
                    {item.word}
                  </h3>
                  <button
                    onClick={() => handleSpeak(item.word, `${item.id}-word`)}
                    className={`p-2 rounded-xl transition-all ${
                      currentlySpeaking === `${item.id}-word`
                        ? 'bg-indigo-500 text-white animate-pulse shadow-lg shadow-indigo-500/50'
                        : 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-600 hover:text-white'
                    }`}
                  >
                    {currentlySpeaking === `${item.id}-word` ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Volume2 className="w-5 h-5" />
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-lg uppercase tracking-wider">
                    {item.pos}
                  </span>
                  <span className="text-xs font-mono text-slate-600 font-bold tracking-widest">
                    {item.ipa}
                  </span>
                  <TypeBadge type={item.type} />
                </div>
              </div>
              <button
                onClick={() => toggleMastery(item)}
                className={`mt-4 p-4 rounded-2xl transition-all ${
                  item.status
                    ? 'bg-indigo-500 text-white shadow-indigo-500/50 scale-110'
                    : 'bg-white/5 text-slate-700 hover:text-emerald-400 hover:bg-emerald-400/10'
                }`}
              >
                <CheckCircle2 className="w-7 h-7" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="border-l-2 border-indigo-500/20 pl-6">
                <p className="text-2xl font-black text-white mb-2 tracking-tight">{item.zh}</p>
                <p className="text-sm text-slate-400 font-medium leading-relaxed italic">
                  {item.en}
                </p>
              </div>
              <div className="bg-black/30 p-6 rounded-3xl border border-white/5 relative group/sentence">
                <p className="text-lg text-indigo-50 font-bold leading-relaxed pr-10">
                  "{item.sent}"
                </p>
                <button
                  onClick={() => handleSpeak(item.sent, `${item.id}-sent`)}
                  className={`absolute right-4 bottom-4 p-2.5 rounded-xl transition-all ${
                    currentlySpeaking === `${item.id}-sent`
                      ? 'bg-indigo-600 text-white animate-pulse shadow-lg shadow-indigo-500/50'
                      : 'bg-white/10 text-slate-500 hover:bg-indigo-600 hover:text-white opacity-0 group-hover/sentence:opacity-100'
                  }`}
                >
                  {currentlySpeaking === `${item.id}-sent` ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <PlayCircle className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        ))}

        {filteredItems.length === 0 && !loading && (
          <div className="text-center py-20 bg-slate-900/20 rounded-[2.5rem] border border-dashed border-white/5">
            <Info className="w-10 h-10 text-slate-700 mx-auto mb-4" />
            <p className="text-slate-500 font-black uppercase text-xs tracking-widest">
              {stats.total === 0 ? '按上方按鈕獲取第一批單字' : '目前沒有符合篩選條件的單字'}
            </p>
          </div>
        )}
      </div>

      {message && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100]">
          <div className="bg-indigo-600 text-white px-8 py-3 rounded-full font-black text-xs shadow-2xl tracking-[0.2em] uppercase border border-white/20">
            {message}
          </div>
        </div>
      )}
    </div>
  );
}
