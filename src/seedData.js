// 內建測試單字（沒 API key 時用）
// 這 8 個是多益常考核心字，涵蓋 Reading/Listening/Both 三種 type
export const SEED_VOCABULARY = [
  {
    word: 'acquire',
    ipa: '/əˈkwaɪər/',
    pos: 'v.',
    zh: '取得；收購',
    en: 'To obtain or come to possess something.',
    sent: 'The company acquired three smaller startups last quarter.',
    category: 'Business',
    type: 'Both',
    synonyms: ['obtain', 'gain', 'secure'],
    root: '-quer-（拉丁語 quaerere）：尋求、獲得'
  },
  {
    word: 'itinerary',
    ipa: '/aɪˈtɪnəreri/',
    pos: 'n.',
    zh: '行程表；旅程',
    en: 'A planned route or journey schedule.',
    sent: 'Please review the itinerary before our trip to Osaka.',
    category: 'Travel',
    type: 'Listening',
    synonyms: ['schedule', 'agenda', 'plan'],
    root: 'itin-（拉丁語 iter）：旅途、道路'
  },
  {
    word: 'negotiate',
    ipa: '/nɪˈɡoʊʃieɪt/',
    pos: 'v.',
    zh: '協商；談判',
    en: 'To discuss something in order to reach an agreement.',
    sent: 'We need to negotiate better terms with the supplier.',
    category: 'Business',
    type: 'Both',
    synonyms: ['bargain', 'discuss', 'mediate'],
    root: '-neg-（拉丁語 negotium）：事務、生意（neg- 否定 + otium 閒暇）'
  },
  {
    word: 'invoice',
    ipa: '/ˈɪnvɔɪs/',
    pos: 'n.',
    zh: '發票；請款單',
    en: 'A document requesting payment for goods or services.',
    sent: 'The invoice was sent to the accounting department yesterday.',
    category: 'Finance',
    type: 'Reading',
    synonyms: ['bill', 'receipt', 'statement'],
    root: null
  },
  {
    word: 'reschedule',
    ipa: '/riːˈskedʒuːl/',
    pos: 'v.',
    zh: '重新安排時間',
    en: 'To change the time of a planned event.',
    sent: "Can we reschedule tomorrow's meeting to next Monday?",
    category: 'Business',
    type: 'Listening',
    synonyms: ['postpone', 'rearrange', 'defer'],
    root: 're-（拉丁語）：再次 + schedule（古法語 cedule）：時程表'
  },
  {
    word: 'warranty',
    ipa: '/ˈwɔːrənti/',
    pos: 'n.',
    zh: '保固；保證書',
    en: "A written guarantee of a product's condition.",
    sent: 'This laptop comes with a two-year warranty.',
    category: 'Commerce',
    type: 'Reading',
    synonyms: ['guarantee', 'assurance', 'pledge'],
    root: '-war-（古北法語 warantir）：保護、擔保'
  },
  {
    word: 'prompt',
    ipa: '/prɑːmpt/',
    pos: 'adj.',
    zh: '迅速的；準時的',
    en: 'Done without delay; punctual.',
    sent: 'Thank you for your prompt response to our inquiry.',
    category: 'General',
    type: 'Both',
    synonyms: ['immediate', 'timely', 'swift'],
    root: 'pro-（拉丁語）：向前 + emere：帶走（promptus 意為準備好的）'
  },
  {
    word: 'renovation',
    ipa: '/ˌrenəˈveɪʃn/',
    pos: 'n.',
    zh: '翻新；整修',
    en: 'The process of repairing and improving something.',
    sent: 'The office renovation will be completed by next month.',
    category: 'Property',
    type: 'Both',
    synonyms: ['refurbishment', 'restoration', 'upgrade'],
    root: 're-（拉丁語）：再次 + nov-（novus）：新的 → 使之重新變新'
  }
];
