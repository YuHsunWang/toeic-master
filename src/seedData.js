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
    type: 'Both'
  },
  {
    word: 'itinerary',
    ipa: '/aɪˈtɪnəreri/',
    pos: 'n.',
    zh: '行程表；旅程',
    en: 'A planned route or journey schedule.',
    sent: 'Please review the itinerary before our trip to Osaka.',
    category: 'Travel',
    type: 'Listening'
  },
  {
    word: 'negotiate',
    ipa: '/nɪˈɡoʊʃieɪt/',
    pos: 'v.',
    zh: '協商；談判',
    en: 'To discuss something in order to reach an agreement.',
    sent: 'We need to negotiate better terms with the supplier.',
    category: 'Business',
    type: 'Both'
  },
  {
    word: 'invoice',
    ipa: '/ˈɪnvɔɪs/',
    pos: 'n.',
    zh: '發票；請款單',
    en: 'A document requesting payment for goods or services.',
    sent: 'The invoice was sent to the accounting department yesterday.',
    category: 'Finance',
    type: 'Reading'
  },
  {
    word: 'reschedule',
    ipa: '/riːˈskedʒuːl/',
    pos: 'v.',
    zh: '重新安排時間',
    en: 'To change the time of a planned event.',
    sent: "Can we reschedule tomorrow's meeting to next Monday?",
    category: 'Business',
    type: 'Listening'
  },
  {
    word: 'warranty',
    ipa: '/ˈwɔːrənti/',
    pos: 'n.',
    zh: '保固；保證書',
    en: "A written guarantee of a product's condition.",
    sent: 'This laptop comes with a two-year warranty.',
    category: 'Commerce',
    type: 'Reading'
  },
  {
    word: 'prompt',
    ipa: '/prɑːmpt/',
    pos: 'adj.',
    zh: '迅速的；準時的',
    en: 'Done without delay; punctual.',
    sent: 'Thank you for your prompt response to our inquiry.',
    category: 'General',
    type: 'Both'
  },
  {
    word: 'renovation',
    ipa: '/ˌrenəˈveɪʃn/',
    pos: 'n.',
    zh: '翻新；整修',
    en: 'The process of repairing and improving something.',
    sent: 'The office renovation will be completed by next month.',
    category: 'Property',
    type: 'Both'
  }
];
