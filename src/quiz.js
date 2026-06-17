const QUESTION_TYPES = ['zh-to-en', 'en-to-zh', 'sentence-fill', 'definition', 'listening'];

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalize(value) {
  return text(value).toLowerCase();
}

function shuffle(items, rng = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordVariants(word) {
  const base = text(word);
  if (!base) return [];

  const variants = new Set([base, `${base}s`, `${base}es`, `${base}ed`, `${base}ing`]);
  if (base.endsWith('e')) {
    variants.add(`${base}d`);
    variants.add(`${base.slice(0, -1)}ing`);
  }
  if (base.endsWith('y')) {
    variants.add(`${base.slice(0, -1)}ies`);
  }

  return [...variants].sort((a, b) => b.length - a.length);
}

export function makeSentenceBlank(sentence, word) {
  const sent = text(sentence);
  const variants = wordVariants(word);
  if (!sent || variants.length === 0) return null;

  const pattern = new RegExp(`\\b(${variants.map(escapeRegex).join('|')})\\b`, 'i');
  if (!pattern.test(sent)) return null;
  return sent.replace(pattern, '___');
}

export function filterQuizVocabulary(vocabulary, filters = {}) {
  const type = filters.type ?? 'All';
  const category = filters.category ?? 'All';

  return (Array.isArray(vocabulary) ? vocabulary : []).filter(item => {
    if (!text(item?.word) || !text(item?.zh)) return false;
    const matchesType = type === 'All' || item.type === type;
    const matchesCategory = category === 'All' || item.category === category;
    return matchesType && matchesCategory;
  });
}

function getAvailableQuestionTypes(item) {
  const types = [];
  if (text(item.zh) && text(item.word)) types.push('zh-to-en', 'en-to-zh', 'listening');
  if (text(item.en) && text(item.word)) types.push('definition');
  if (makeSentenceBlank(item.sent, item.word)) types.push('sentence-fill');
  return types;
}

function addCandidates(target, source, item, answerField, seen, rng) {
  const correct = normalize(item[answerField]);
  for (const candidate of shuffle(source, rng)) {
    const value = text(candidate?.[answerField]);
    const key = normalize(value);
    if (!key || key === correct || seen.has(key)) continue;
    target.push({ label: value, value });
    seen.add(key);
    if (target.length === 3) break;
  }
}

export function makeOptions(item, vocabulary, answerField, rng = Math.random) {
  const correctValue = text(item?.[answerField]);
  if (!correctValue) return null;

  const distractors = [];
  const seen = new Set([normalize(correctValue)]);
  const pool = (Array.isArray(vocabulary) ? vocabulary : []).filter(v => text(v?.[answerField]));

  addCandidates(
    distractors,
    pool.filter(v => text(v.category) && text(v.category) === text(item.category)),
    item,
    answerField,
    seen,
    rng
  );
  if (distractors.length < 3) {
    addCandidates(
      distractors,
      pool.filter(v => text(v.pos) && text(v.pos) === text(item.pos)),
      item,
      answerField,
      seen,
      rng
    );
  }
  if (distractors.length < 3) {
    addCandidates(distractors, pool, item, answerField, seen, rng);
  }

  if (distractors.length < 3) return null;

  return shuffle(
    [{ label: correctValue, value: correctValue, isCorrect: true }, ...distractors],
    rng
  );
}

function buildQuestion(item, vocabulary, rng = Math.random) {
  const availableTypes = getAvailableQuestionTypes(item);
  if (availableTypes.length === 0) return null;

  for (const type of shuffle(availableTypes, rng)) {
    const answerField = type === 'en-to-zh' || type === 'listening' ? 'zh' : 'word';
    const options = makeOptions(item, vocabulary, answerField, rng);
    if (!options) continue;

    const base = {
      id: `${item.id ?? item.word}-${type}-${Math.floor(rng() * 1000000)}`,
      type,
      item,
      answer: text(item[answerField]),
      options
    };

    if (type === 'zh-to-en') {
      return {
        ...base,
        title: '中 → 英',
        prompt: text(item.zh),
        instruction: '選出對應的英文單字'
      };
    }
    if (type === 'en-to-zh') {
      return {
        ...base,
        title: '英 → 中',
        prompt: text(item.word),
        instruction: '選出正確中文意思'
      };
    }
    if (type === 'sentence-fill') {
      const prompt = makeSentenceBlank(item.sent, item.word);
      if (!prompt) continue;
      return {
        ...base,
        title: '例句填空',
        prompt,
        instruction: '選出最適合填入空格的單字'
      };
    }
    if (type === 'definition') {
      return {
        ...base,
        title: '定義配對',
        prompt: text(item.en),
        instruction: '選出符合英文定義的單字'
      };
    }
    if (type === 'listening') {
      return {
        ...base,
        title: '聽力',
        prompt: '播放發音後，選出正確中文意思',
        instruction: '聽音辨義',
        speakText: text(item.word)
      };
    }
  }

  return null;
}

export function generateQuiz(vocabulary, settings = {}) {
  const allVocabulary = filterQuizVocabulary(settings.allVocabulary ?? vocabulary, {
    type: 'All',
    category: 'All'
  });
  const scope = filterQuizVocabulary(vocabulary, settings);

  if (allVocabulary.length < 4) {
    return {
      ok: false,
      reason: 'too-few',
      message: '單字太少，無法出題，請先新增單字',
      questions: []
    };
  }

  if (scope.length === 0) {
    return {
      ok: false,
      reason: 'empty-scope',
      message: '篩選後沒有可出題的單字，請調整條件',
      questions: []
    };
  }

  const desiredCount =
    settings.count === 'all' ? scope.length : Math.min(Number(settings.count) || 10, scope.length);
  const selected = shuffle(scope, settings.rng).slice(0, desiredCount);
  const questions = selected
    .map(item => buildQuestion(item, allVocabulary, settings.rng))
    .filter(Boolean);

  if (questions.length === 0) {
    return {
      ok: false,
      reason: 'no-valid-questions',
      message: '目前單字資料不足以組成測驗，請補齊單字內容',
      questions: []
    };
  }

  return {
    ok: true,
    reason: null,
    message: '',
    questions
  };
}

export { QUESTION_TYPES };
