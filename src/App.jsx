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
  Brain,
  ArrowRight,
  RotateCcw,
  Trash2
} from 'lucide-react';

import { vocabDb, ttsCacheDb } from './db.js';
import { speak, preloadTTS } from './speechService.js';
import { filterQuizVocabulary, generateQuiz } from './quiz.js';
import StoryPanel from './StoryPanel.jsx';
import NEWS_VOCAB from './data/news-vocab.json';
import {
  getGeminiApiKey,
  hasGeminiApiKey,
  MISSING_GEMINI_API_KEY_MESSAGE
} from './apiKey.js';

const THEME_STORAGE_KEY = 'toeic_theme';
const DEFAULT_THEME = 'warm-sand';
const THEME_OPTIONS = [
  { value: 'indigo-night', label: 'Indigo Night' },
  { value: 'emerald-forest', label: 'Emerald Forest' },
  { value: 'clean-light', label: 'Clean Light' },
  { value: 'violet-neon', label: 'Violet Neon' },
  { value: 'warm-sand', label: 'Warm Sand' }
];

// ============================================================
// API key setup
// Dev: create .env.local with VITE_GEMINI_API_KEY=your-key
// Offline features need no key; generating words and high-quality TTS do
// ============================================================

const MAX_AI_WORDS = 10;
const MAX_SENSES = 3;
const ALLOWED_TYPES = new Set(['Reading', 'Listening', 'Both']);
const FIELD_LIMITS = {
  word: 80,
  ipa: 80,
  pos: 40,
  category: 80,
  type: 20,
  en: 240,
  zh: 160,
  example: 300
};

function cleanString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function validateGeneratedWords(value) {
  if (!Array.isArray(value)) {
    throw new Error('AI response is not a valid word array');
  }

  const items = [];
  for (const item of value.slice(0, MAX_AI_WORDS)) {
    if (!item || typeof item !== 'object') continue;

    const word = cleanString(item.word, FIELD_LIMITS.word);
    const type = cleanString(item.type, FIELD_LIMITS.type);
    if (!word || !ALLOWED_TYPES.has(type)) continue;

    let senses;
    if (Array.isArray(item.senses)) {
      senses = item.senses.slice(0, MAX_SENSES).map(s => ({
        en: cleanString(s?.en, FIELD_LIMITS.en),
        zh: cleanString(s?.zh, FIELD_LIMITS.zh),
        example: cleanString(s?.example, FIELD_LIMITS.example)
      })).filter(s => s.en || s.zh);
    } else {
      senses = [{
        en: cleanString(item.en, FIELD_LIMITS.en),
        zh: cleanString(item.zh, FIELD_LIMITS.zh),
        example: cleanString(item.sent, FIELD_LIMITS.example)
      }];
    }

    if (senses.length === 0) continue;

    items.push({
      word,
      ipa: cleanString(item.ipa, FIELD_LIMITS.ipa),
      pos: cleanString(item.pos, FIELD_LIMITS.pos),
      category: cleanString(item.category, FIELD_LIMITS.category),
      type,
      senses
    });
  }

  if (items.length === 0) {
    throw new Error('AI returned no valid words.');
  }

  return { items, skipped: value.length - items.length };
}

function flattenForQuiz(item) {
  const senses = Array.isArray(item.senses) ? item.senses : [];
  const s0 = senses[0] ?? {};
  const example = senses.map(s => s.example).find(ex => Boolean(ex)) ?? item.sent ?? '';
  return {
    ...item,
    zh: s0.zh ?? item.zh ?? '',
    en: s0.en ?? item.en ?? '',
    sent: example
  };
}

export default function App() {
  const [theme, setTheme] = useState(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return THEME_OPTIONS.some(option => option.value === savedTheme) ? savedTheme : DEFAULT_THEME;
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentlySpeaking, setCurrentlySpeaking] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState(null);
  const [filterType, setFilterType] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [preloadProgress, setPreloadProgress] = useState(null);
  const [mode, setMode] = useState('list');
  const [quizCount, setQuizCount] = useState('10');
  const [quizType, setQuizType] = useState('All');
  const [quizCategory, setQuizCategory] = useState('All');
  const [quizSession, setQuizSession] = useState(null);
  const [quizMessage, setQuizMessage] = useState('');

  // useLiveQuery: auto re-render on data change, like Firestore onSnapshot
  // undefined = loading, [] = empty list
  const vocabulary = useLiveQuery(() => vocabDb.getAll(), []);
  const cacheSize = useLiveQuery(() => ttsCacheDb.size(), [], 0);
  const loading = vocabulary === undefined;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  // Listen to online/offline status
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

  // Seed sample words on first open (so users without an API key still have content)
  useEffect(() => {
    vocabDb.seedIfEmpty().then(async seeded => {
      if (seeded) flashMessage('Loaded the starter vocabulary. Happy studying!', 3500);
      // After seeding, so a fresh install still gets the starter book first.
      const added = await vocabDb.importNews(NEWS_VOCAB);
      if (added > 0 && !seeded) flashMessage(`Added ${added} words from this week's news.`, 3500);
    });
  }, []);

  // Show a brief toast message
  const flashMessage = (text, duration = 3000) => {
    setMessage(text);
    setTimeout(() => setMessage(null), duration);
  };

  // Play audio
  const handleSpeak = async (text, id) => {
    if (currentlySpeaking) return;
    setCurrentlySpeaking(id);
    try {
      const apiKey = hasGeminiApiKey() ? getGeminiApiKey() : '';
      const { source } = await speak(text, apiKey);
      // If using the browser's built-in voice, show a small hint (only when offline, to avoid spam)
      if (source === 'browser' && !isOnline) {
        flashMessage('Offline mode: using built-in voice.', 1500);
      }
    } catch (e) {
      console.error(e);
      flashMessage('Audio playback failed');
    } finally {
      setCurrentlySpeaking(null);
    }
  };

  // Generate a new batch of words with AI
  const generateNewBatchWithAI = async () => {
    if (isGenerating) return;
    if (!isOnline) return flashMessage('Cannot generate words while offline.');
    if (!hasGeminiApiKey()) return flashMessage(MISSING_GEMINI_API_KEY_MESSAGE);

    setIsGenerating(true);
    setMessage('AI is generating TOEIC vocabulary...');

    try {
      const apiKey = getGeminiApiKey();
      const existingWords = (await vocabDb.getWordList()).join(', ');
      const systemPrompt = `You are a professional TOEIC teacher. Generate 10 high-quality TOEIC vocabulary items as a JSON array. For polysemous words include up to 3 senses. Each item: word, ipa, pos, category, type(Reading/Listening/Both), senses(array of {en, zh, example}). Do not include: ${existingWords}.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Generate 10 TOEIC vocabulary items.' }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { responseMimeType: 'application/json' }
          })
        }
      );
      if (!response.ok) {
        throw new Error(`Gemini API failed with HTTP ${response.status}.`);
      }
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== 'string' || !text.trim()) {
        throw new Error('Gemini response is not valid JSON text');
      }
      const parsedWords = JSON.parse(text);
      const { items: newWords, skipped: invalidSkipped } = validateGeneratedWords(parsedWords);

      const { added, skipped } = await vocabDb.addMany(newWords);
      const totalSkipped = skipped + invalidSkipped;
      if (added === 0) {
        flashMessage('AI generated only duplicate or invalid words. Try again.');
      } else if (totalSkipped > 0) {
        flashMessage(`Added ${added} words; skipped ${totalSkipped} duplicates or invalid items.`);
      } else {
        flashMessage(`Added ${added} words.`);
      }
    } catch (err) {
      console.error(err);
      if (err instanceof SyntaxError) {
        flashMessage('AI returned invalid JSON. Try again.');
      } else if (
        err.message?.startsWith('AI ') ||
        err.message?.startsWith('Gemini ')
      ) {
        flashMessage(err.message);
      } else {
        flashMessage('Generation failed. Check API key or network.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Preload all word audio into cache (so the app works fully offline)
  const handlePreloadTTS = async () => {
    if (!isOnline) return flashMessage('Network is required to preload audio.');
    if (!hasGeminiApiKey()) return flashMessage(MISSING_GEMINI_API_KEY_MESSAGE);
    if (!vocabulary || vocabulary.length === 0) return;

    // Collect all texts to generate (words + example sentences across all senses)
    const texts = [];
    for (const v of vocabulary) {
      texts.push(v.word);
      for (const s of Array.isArray(v.senses) ? v.senses : []) {
        if (s.example) texts.push(s.example);
      }
    }

    setPreloadProgress({ done: 0, total: texts.length });
    try {
      const result = await preloadTTS(texts, getGeminiApiKey(), (progress) => {
        setPreloadProgress(progress);
      });
      flashMessage(`Preload complete: ${result.done - result.failed} cached, ${result.skipped} skipped.`);
    } catch (e) {
      flashMessage('Audio preload failed.');
    } finally {
      setPreloadProgress(null);
    }
  };

  const toggleMastery = async (item) => {
    await vocabDb.toggleStatus(item.id, !item.status);
  };

  // Two taps to delete: the first arms the button for 3 seconds, the second deletes.
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const deleteWord = async (item) => {
    if (pendingDeleteId !== item.id) {
      setPendingDeleteId(item.id);
      setTimeout(() => setPendingDeleteId(id => (id === item.id ? null : id)), 3000);
      return;
    }
    setPendingDeleteId(null);
    await vocabDb.remove(item.id);
    flashMessage(`Deleted "${item.word}".`);
  };


  const filteredItems = useMemo(() => {
    if (!vocabulary) return [];
    return vocabulary.filter(v => {
      const word = typeof v.word === 'string' ? v.word : '';
      const senses = Array.isArray(v.senses) ? v.senses : [];
      const matchesSearch = !searchTerm ||
        word.toLowerCase().includes(searchTerm.toLowerCase()) ||
        senses.some(s =>
          (typeof s.zh === 'string' && s.zh.includes(searchTerm)) ||
          (typeof s.en === 'string' && s.en.toLowerCase().includes(searchTerm.toLowerCase()))
        );
      const matchesType = filterType === 'All' || v.type === filterType;
      const matchesStatus =
        filterStatus === 'All' ? true : filterStatus === 'Mastered' ? v.status : !v.status;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [vocabulary, searchTerm, filterType, filterStatus]);

  const quizCategories = useMemo(() => {
    if (!vocabulary) return [];
    return [...new Set(vocabulary.map(v => v.category).filter(Boolean))].sort();
  }, [vocabulary]);

  const quizScope = useMemo(
    () => filterQuizVocabulary((vocabulary ?? []).map(flattenForQuiz), { type: quizType, category: quizCategory }),
    [vocabulary, quizType, quizCategory]
  );

  const startQuiz = (sourceItems = null, override = {}) => {
    const flatVocab = (vocabulary ?? []).map(flattenForQuiz);
    const result = generateQuiz(sourceItems ? sourceItems.map(flattenForQuiz) : flatVocab, {
      count: override.count ?? quizCount,
      type: override.type ?? quizType,
      category: override.category ?? quizCategory,
      allVocabulary: flatVocab
    });

    if (!result.ok) {
      setQuizSession(null);
      setQuizMessage(result.message);
      return;
    }

    setQuizMessage('');
    setQuizSession({
      questions: result.questions,
      currentIndex: 0,
      answers: [],
      selectedValue: null,
      isFinished: false
    });
  };

  const answerQuiz = (option) => {
    if (!quizSession || quizSession.selectedValue !== null) return;
    const question = quizSession.questions[quizSession.currentIndex];
    const isCorrect = option.value === question.answer;
    setQuizSession({
      ...quizSession,
      selectedValue: option.value,
      answers: [
        ...quizSession.answers,
        {
          question,
          selectedValue: option.value,
          selectedLabel: option.label,
          isCorrect
        }
      ]
    });
  };

  const nextQuizQuestion = () => {
    if (!quizSession) return;
    const nextIndex = quizSession.currentIndex + 1;
    if (nextIndex >= quizSession.questions.length) {
      setQuizSession({ ...quizSession, isFinished: true, selectedValue: null });
      return;
    }
    setQuizSession({ ...quizSession, currentIndex: nextIndex, selectedValue: null });
  };

  const resetQuiz = () => {
    setQuizSession(null);
    setQuizMessage('');
  };

  const retryWrongQuestions = () => {
    if (!quizSession) return;
    const wrongItems = quizSession.answers
      .filter(answer => !answer.isCorrect)
      .map(answer => answer.question.item);
    startQuiz(wrongItems, { count: 'all', type: 'All', category: 'All' });
  };

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
        color: 'bg-[var(--badge-bg)] text-[var(--badge-text)] border-[var(--border)]',
        icon: <Eye className="w-3 h-3" />,
        label: 'Reading'
      },
      Listening: {
        color: 'bg-[var(--badge-bg)] text-[var(--badge-text)] border-[var(--border)]',
        icon: <Ear className="w-3 h-3" />,
        label: 'Listening'
      },
      Both: {
        color: 'bg-[var(--badge-bg)] text-[var(--badge-text)] border-[var(--border)]',
        icon: <Zap className="w-3 h-3" />,
        label: 'Both'
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

  const QuizPanel = () => {
    const countChoices = [
      { value: '5', label: '5 Questions' },
      { value: '10', label: '10 Questions' },
      { value: '20', label: '20 Questions' },
      { value: 'all', label: 'All' }
    ];
    const typeChoices = ['All', 'Reading', 'Listening', 'Both'];

    if (!quizSession) {
      const hasEmptyScope = (vocabulary?.length ?? 0) >= 4 && quizScope.length === 0;

      return (
        <div className="space-y-5">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-[var(--badge-bg)] text-[var(--badge-text)] p-3 rounded-2xl">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-black text-[var(--text)] tracking-tight">Quiz</h2>
                <p className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest">
                  Offline Practice
                </p>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <p className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-2">
                  Questions
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {countChoices.map(choice => (
                    <button
                      key={choice.value}
                      onClick={() => setQuizCount(choice.value)}
                      className={`py-3 rounded-xl border text-xs font-black transition-all ${
                        quizCount === choice.value
                          ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-text)]'
                          : 'bg-[var(--bg)] border-[var(--border)] text-[var(--muted)]'
                      }`}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-2">
                  Type
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {typeChoices.map(type => (
                    <button
                      key={type}
                      onClick={() => setQuizType(type)}
                      className={`py-3 rounded-xl border text-[10px] font-black uppercase transition-all ${
                        quizType === type
                          ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-text)]'
                          : 'bg-[var(--bg)] border-[var(--border)] text-[var(--muted)]'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-2">
                  Category
                </p>
                <select
                  value={quizCategory}
                  onChange={e => setQuizCategory(e.target.value)}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl py-3 px-4 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--primary)]"
                >
                  <option value="All">All</option>
                  {quizCategories.map(category => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-4">
                <p className="text-sm font-bold text-[var(--muted)]">
                  Available questions: <span className="text-[var(--primary)]">{quizScope.length}</span>
                </p>
                {hasEmptyScope && (
                  <p className="text-xs font-bold text-[var(--star)] mt-2">
                    No words match the selected quiz scope.
                  </p>
                )}
                {quizMessage && (
                  <p className="text-xs font-bold text-[var(--star)] mt-2">{quizMessage}</p>
                )}
              </div>

              <button
                onClick={() => startQuiz()}
                className="w-full py-4 rounded-2xl bg-[var(--primary)] text-[var(--primary-text)] font-black text-sm tracking-widest uppercase transition-all flex items-center justify-center gap-2 shadow-xl"
              >
                Start Quiz
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      );
    }

    const current = quizSession.questions[quizSession.currentIndex];
    const answered = quizSession.selectedValue !== null;
    const correctCount = quizSession.answers.filter(answer => answer.isCorrect).length;
    const wrongAnswers = quizSession.answers.filter(answer => !answer.isCorrect);
    const percent = quizSession.answers.length
      ? Math.round((correctCount / quizSession.answers.length) * 100)
      : 0;

    if (quizSession.isFinished) {
      return (
        <div className="space-y-5">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] p-7 shadow-xl text-center">
            <p className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-2">
              Result
            </p>
            <h2 className="text-4xl font-black text-[var(--text)] mb-2">
              {correctCount}/{quizSession.questions.length}
            </h2>
            <p className="text-lg font-black text-[var(--primary)]">{percent}% accuracy</p>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] p-6 shadow-xl">
            <h3 className="text-sm font-black text-[var(--text)] uppercase tracking-widest mb-4">
              Wrong Answers
            </h3>
            {wrongAnswers.length === 0 ? (
              <p className="text-sm font-bold text-[var(--accent)]">No wrong answers.</p>
            ) : (
              <div className="space-y-3">
                {wrongAnswers.map(answer => (
                  <div
                    key={answer.question.id}
                    className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-4"
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <p className="text-lg font-black text-[var(--text)]">{answer.question.item.word}</p>
                      <span className="text-[10px] font-black text-[var(--primary)] uppercase">
                        {answer.question.title}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-[var(--text)]">
                      Correct answer: {answer.question.answer}
                    </p>
                    <p className="text-xs font-bold text-[var(--muted)] mt-1">
                      Your answer: {answer.selectedLabel}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={retryWrongQuestions}
              disabled={wrongAnswers.length === 0}
              className="py-4 rounded-2xl bg-[var(--surface)] border border-[var(--star)] text-[var(--star)] disabled:opacity-40 font-black text-xs tracking-widest uppercase"
            >
              Retry Wrong
            </button>
            <button
              onClick={resetQuiz}
              className="py-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] font-black text-xs tracking-widest uppercase flex items-center justify-center gap-2"
            >
              Reset
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] p-6 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1">
              {current.title}
            </p>
            <p className="text-sm font-black text-[var(--primary)]">
              {quizSession.currentIndex + 1} / {quizSession.questions.length}
            </p>
          </div>
          <button
            onClick={resetQuiz}
            className="px-4 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)] text-[10px] font-black uppercase"
          >
            Back
          </button>
        </div>

        <div className="bg-[var(--bg)] border border-[var(--border)] rounded-3xl p-6 mb-5">
          <p className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-3">
            {current.instruction}
          </p>
          <p className="text-2xl font-black text-[var(--text)] leading-relaxed">{current.prompt}</p>
          {current.type === 'listening' && (
            <button
              onClick={() => handleSpeak(current.speakText, `quiz-${current.id}`)}
              className="mt-5 px-5 py-3 rounded-2xl bg-[var(--surface)] border border-[var(--primary)] text-[var(--primary)] font-black text-xs uppercase tracking-widest flex items-center gap-2"
            >
              {currentlySpeaking === `quiz-${current.id}` ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
              Play
            </button>
          )}
        </div>

        <div className="space-y-3">
          {current.options.map(option => {
            const isCorrect = option.value === current.answer;
            const isSelected = option.value === quizSession.selectedValue;
            const stateClass = !answered
              ? 'bg-[var(--bg)] border-[var(--border)] text-[var(--text)] hover:border-[var(--primary)] hover:bg-[var(--surface)]'
              : isCorrect
                ? 'bg-[var(--surface)] border-[var(--accent)] text-[var(--accent)]'
                : isSelected
                  ? 'bg-[var(--surface)] border-[var(--danger)] text-[var(--danger)]'
                  : 'bg-[var(--bg)] border-[var(--border)] text-[var(--muted)]';

            return (
              <button
                key={option.value}
                onClick={() => answerQuiz(option)}
                disabled={answered}
                className={`w-full text-left p-4 rounded-2xl border font-black transition-all ${stateClass}`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {answered && (
          <div className="mt-5 space-y-4">
            <p
              className={`text-sm font-black ${
                quizSession.answers[quizSession.answers.length - 1]?.isCorrect
                  ? 'text-[var(--accent)]'
                  : 'text-[var(--danger)]'
              }`}
            >
              {quizSession.answers[quizSession.answers.length - 1]?.isCorrect
                ? 'Correct.'
                : `Incorrect. Answer: ${current.answer}`}
            </p>
            <button
              onClick={nextQuizQuestion}
              className="w-full py-4 rounded-2xl bg-[var(--primary)] text-[var(--primary-text)] font-black text-sm tracking-widest uppercase hover:bg-[var(--primary)] transition-all flex items-center justify-center gap-2"
            >
              {quizSession.currentIndex + 1 >= quizSession.questions.length ? 'Finish' : 'Next'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    );
  };

  if (loading)
    return (
      <div className="h-screen bg-[var(--bg)] flex flex-col items-center justify-center gap-6">
        <Loader2 className="w-10 h-10 text-[var(--primary)] animate-spin" />
        <p className="text-[var(--primary)] font-bold tracking-[0.2em] text-[10px] uppercase">
          Booting Master System...
        </p>
      </div>
    );

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] p-5 pb-20 selection:bg-[var(--primary)] selection:text-[var(--primary-text)]">
      <div className="max-w-xl mx-auto pt-4 mb-8">
        <header className="flex justify-between items-start gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="bg-[var(--primary)] p-3 rounded-2xl shadow-xl  rotate-3">
              <Headphones className="w-6 h-6 text-[var(--primary-text)]" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-[var(--text)] leading-none italic uppercase tracking-tighter">
                TOEIC <span className="text-[var(--primary)]">Master</span>
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest">
                  Active Learning Engine
                </p>
                {/* online/offline indicator */}
                {isOnline ? (
                  <span className="flex items-center gap-1 text-[9px] font-black text-[var(--accent)] uppercase">
                    <Wifi className="w-3 h-3" /> On
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[9px] font-black text-[var(--star)] uppercase">
                    <WifiOff className="w-3 h-3" /> Off
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <label htmlFor="theme-select" className="sr-only">
              Theme
            </label>
            <select
              id="theme-select"
              value={theme}
              onChange={e => setTheme(e.target.value)}
              className="max-w-[10rem] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest outline-none focus:border-[var(--primary)]"
            >
              {THEME_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="bg-[var(--surface)] border border-[var(--border)] px-4 py-2 rounded-xl text-right">
              <p className="text-xs font-black text-[var(--muted)] uppercase mb-0.5">Mastery Rate</p>
              <p className="text-xl font-black text-[var(--primary)] leading-none">{stats.percent}%</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-2 mb-6 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-1">
          {[
            { value: 'list', label: 'List' },
            { value: 'quiz', label: 'Quiz' },
            { value: 'story', label: 'Story' }
          ].map(tab => (
            <button
              key={tab.value}
              onClick={() => setMode(tab.value)}
              className={`py-3 rounded-xl text-xs font-black tracking-widest transition-all ${
                mode === tab.value
                  ? 'bg-[var(--primary)] text-[var(--primary-text)] shadow-lg '
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {mode === 'list' ? (
          <>
        <button
          onClick={generateNewBatchWithAI}
          disabled={isGenerating || !isOnline}
          className="w-full mb-4 relative group overflow-hidden disabled:opacity-40"
        >
          <div className="absolute inset-0 bg-[var(--primary)] opacity-90 transition-transform group-hover:scale-105" />
          <div className="relative flex items-center justify-center gap-4 py-5 rounded-3xl font-black text-sm tracking-widest uppercase text-[var(--primary-text)] shadow-2xl">
            {isGenerating ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Sparkles className="w-5 h-5 animate-bounce" />
            )}
            {isGenerating ? 'Analyzing...' : 'Generate AI Words'}
          </div>
        </button>


        {/* Preload audio button */}
        <button
          onClick={handlePreloadTTS}
          disabled={!isOnline || !!preloadProgress || stats.total === 0}
          className="w-full mb-8 py-3 rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-[10px] font-black uppercase tracking-widest text-[var(--text)] hover:bg-[var(--surface)] disabled:opacity-40 transition-all flex items-center justify-center gap-2"
        >
          {preloadProgress ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Preloading {preloadProgress.done}/{preloadProgress.total}
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Cached audio: {cacheSize}
            </>
          )}
        </button>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-3xl flex flex-col items-center">
            <span className="text-[10px] font-black text-[var(--muted)] uppercase mb-1">
              Mastered
            </span>
            <span className="text-2xl font-black text-[var(--primary)]">{stats.mastered}</span>
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-3xl flex flex-col items-center">
            <span className="text-[10px] font-black text-[var(--muted)] uppercase mb-1">
              Learning
            </span>
            <span className="text-2xl font-black text-[var(--accent)]">{stats.learning}</span>
          </div>
        </div>

        <div className="space-y-4 mb-8">
          <div className="relative">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted)]" />
            <input
              type="text"
              placeholder="Search vocabulary..."
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl py-4 pl-16 pr-6 font-bold focus:border-[var(--primary)] outline-none transition-all placeholder:text-[var(--muted)]"
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
                    ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-text)] shadow-lg '
                    : 'bg-[var(--surface)] border-[var(--border)] text-[var(--muted)]'
                }`}
              >
                {t === 'All' ? 'All Types' : t}
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
                    ? 'bg-[var(--surface)] border-[var(--border)] text-[var(--text)]'
                    : 'bg-[var(--bg)] border-transparent text-[var(--muted)]'
                }`}
              >
                {s === 'All' ? 'All' : s === 'Learning' ? 'Learning' : 'Mastered'}
              </button>
            ))}
          </div>
        </div>
          </>
        ) : mode === 'quiz' ? (
          <QuizPanel />
        ) : (
          <StoryPanel
            vocabulary={vocabulary}
            handleSpeak={handleSpeak}
            currentlySpeaking={currentlySpeaking}
          />
        )}
      </div>

      {mode === 'list' && (
      <div className="max-w-xl mx-auto space-y-6">
        {filteredItems.map(item => (
          <div
            key={item.id}
            className={`group p-8 rounded-[2.5rem] border transition-all relative overflow-hidden ${
              item.status
                ? 'bg-[var(--surface)] border-[var(--border)] grayscale-[0.6] opacity-60'
                : 'bg-[var(--surface)] border-[var(--border)] hover:border-[var(--primary)] shadow-xl'
            }`}
          >
            <div
              className={`absolute top-0 right-0 px-6 py-1.5 rounded-bl-3xl text-[9px] font-black uppercase tracking-[0.2em] ${
                item.status
                  ? 'bg-[var(--primary)] text-[var(--primary-text)]'
                  : 'bg-[var(--surface)] text-[var(--accent)] border border-[var(--accent)] animate-pulse'
              }`}
            >
              {item.status ? 'Mastered' : 'Learning'}
            </div>

            <div className="flex justify-between items-start mb-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-3xl font-black text-[var(--text)] group-hover:text-[var(--primary)] transition-colors tracking-tight">
                    {item.word}
                  </h3>
                  <button
                    onClick={() => handleSpeak(item.word, `${item.id}-word`)}
                    className={`p-2 rounded-xl transition-all ${
                      currentlySpeaking === `${item.id}-word`
                        ? 'bg-[var(--primary)] text-[var(--primary-text)] animate-pulse shadow-lg '
                        : 'bg-[var(--surface)] text-[var(--primary)] hover:bg-[var(--primary)] hover:text-[var(--primary-text)]'
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
                  <span className="text-[10px] font-black bg-[var(--badge-bg)] text-[var(--badge-text)] px-2.5 py-0.5 rounded-lg uppercase tracking-wider">
                    {item.pos}
                  </span>
                  <span className="text-xs font-mono text-[var(--muted)] font-bold tracking-widest">
                    {item.ipa}
                  </span>
                  <TypeBadge type={item.type} />
                </div>
              </div>
              <div className="mt-4 flex flex-col items-center gap-2">
                <button
                  onClick={() => toggleMastery(item)}
                  aria-label={item.status ? `Mark ${item.word} as learning` : `Mark ${item.word} as mastered`}
                  className={`p-4 rounded-2xl transition-all ${
                    item.status
                      ? 'bg-[var(--primary)] text-[var(--primary-text)]  scale-110'
                      : 'bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--surface)]'
                  }`}
                >
                  <CheckCircle2 className="w-7 h-7" />
                </button>
                <button
                  onClick={() => deleteWord(item)}
                  aria-label={pendingDeleteId === item.id ? `Tap again to delete ${item.word}` : `Delete ${item.word}`}
                  className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-1 transition-all ${
                    pendingDeleteId === item.id
                      ? 'bg-[var(--danger)] text-white'
                      : 'text-[var(--muted)] hover:text-[var(--danger)]'
                  }`}
                >
                  <Trash2 className="w-4 h-4" />
                  {pendingDeleteId === item.id && 'Sure?'}
                </button>
              </div>
            </div>

            <div className="space-y-6">
              {(Array.isArray(item.senses) ? item.senses : []).map((sense, idx) => (
                <div key={idx} className="space-y-3">
                  {item.senses.length > 1 && (
                    <p className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest">
                      Meaning {idx + 1}
                    </p>
                  )}
                  <div className="border-l-2 border-[var(--primary)] pl-6">
                    <p className="text-2xl font-black text-[var(--text)] mb-2 tracking-tight">{sense.zh}</p>
                    <p className="text-sm text-[var(--muted)] font-medium leading-relaxed italic">
                      {sense.en}
                    </p>
                  </div>
                  <div className="bg-[var(--bg)] p-6 rounded-3xl border border-[var(--border)] relative group/sentence">
                    <p className="text-lg text-[var(--text)] font-bold leading-relaxed pr-10">
                      "{sense.example}"
                    </p>
                    <button
                      onClick={() => handleSpeak(sense.example, `${item.id}-s${idx}`)}
                      className={`absolute right-4 bottom-4 p-2.5 rounded-xl transition-all ${
                        currentlySpeaking === `${item.id}-s${idx}`
                          ? 'bg-[var(--primary)] text-[var(--primary-text)] animate-pulse shadow-lg '
                          : 'bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--primary)] hover:text-[var(--primary-text)] opacity-0 group-hover/sentence:opacity-100'
                      }`}
                    >
                      {currentlySpeaking === `${item.id}-s${idx}` ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <PlayCircle className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {filteredItems.length === 0 && !loading && (
          <div className="text-center py-20 bg-[var(--surface)] rounded-[2.5rem] border border-dashed border-[var(--border)]">
            <Info className="w-10 h-10 text-[var(--muted)] mx-auto mb-4" />
            <p className="text-[var(--muted)] font-black uppercase text-xs tracking-widest">
              {stats.total === 0 ? 'No vocabulary yet.' : 'No words match the filters.'}
            </p>
          </div>
        )}
      </div>
      )}

      {message && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100]">
          <div className="bg-[var(--primary)] text-[var(--primary-text)] px-8 py-3 rounded-full font-black text-xs shadow-2xl tracking-[0.2em] uppercase border border-[var(--border)]">
            {message}
          </div>
        </div>
      )}
    </div>
  );
}
