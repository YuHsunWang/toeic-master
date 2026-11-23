# Task: write TOEIC story episodes

Read `scripts/story-plan.json`. For EVERY episode in it, write one episode.
Write ALL episodes as one JSON array to `src/data/stories.json`.
Then run `node scripts/stories.mjs check` and fix every dropped episode until it keeps all of them.
Do not edit any other file.

## The world (same in every episode)
- The player is a new hire at Harbor & Pine Trading, a mid-size import/export company.
- Recurring cast: Ms. Chen (manager), Ben (friendly coworker), Ms. Ortiz (key client), Raj (IT support), Linda (finance).
- Each episode is a self-contained workday story with a small goal (e.g. close a supplier deal, fix a shipping delay). Episodes can be played in any order, so never depend on earlier episodes.

## Episode format
```json
{
  "id": "ep01",                       // same id as the plan
  "title": "The Missing Invoice",     // English, short
  "scenes": [ ... one scene per plan word, in story order ... ],
  "ending": "你在週五前把發票核對完，Linda 請你喝咖啡。"  // Traditional Chinese, 1 sentence
}
```

## Scene format — two kinds, use both in every episode (about half each)

### email (reading, like TOEIC Part 5/6)
```json
{
  "kind": "email",
  "word": "verify",                        // the plan word, exactly as written in the plan
  "from": "Ms. Chen",
  "setup": "主管早上寄信給你，關於上週的發票。",   // Traditional Chinese, 1 short sentence
  "text": "Please ____ the invoice amounts before Friday.",  // English, 1-3 sentences, exactly one ____
  "options": ["verify", "postpone", "reimburse"],           // 3 English words; answer + 2 TOEIC-level distractors that are grammatical but wrong in context
  "answer": "verify",                      // the plan word or its inflected form (verifies, verified, verifying)
  "rescue": {
    "reaction": "Postpone? No — I need the numbers checked, not delayed.",  // English, the character reacts to a wrong choice and hints the meaning
    "options": ["verify", "reimburse"],    // 2 options, must include the same answer
    "answer": "verify"
  }
}
```

### call (listening, like TOEIC Part 2)
```json
{
  "kind": "call",
  "word": "shipment",
  "from": "Ms. Ortiz",
  "setup": "客戶打電話來，聽起來有點急。",
  "text": "Hi, our shipment still hasn't arrived. Can you check the tracking number?",  // English, spoken, 1-2 sentences, MUST contain the plan word (or an inflected form)
  "question": "對方想要你做什麼？",          // Traditional Chinese
  "options": ["查貨運追蹤號碼", "安排新的會議", "寄一份報價單"],  // 3 Traditional Chinese options
  "answer": "查貨運追蹤號碼",
  "rescue": {
    "reaction": "No, no — I'm asking about the delivery. Where is the package?",
    "options": ["查貨運追蹤號碼", "寄一份報價單"],
    "answer": "查貨運追蹤號碼"
  }
}
```

## Quality rules
- Use the meaning of the word listed in the plan, natural business English, TOEIC level (CEFR B1-B2).
- Wrong options must be plausible, not silly. The right answer must be clearly right from the context.
- The rescue reaction must make the correct answer easier to find without saying it outright.
- No content about declaring, cheating, or anything unsafe; keep it a normal office day.
- Write like real coworkers: short, plain, contractions are fine. No AI-style wording: the validator rejects delve, seamless, leverage, robust, streamline, pivotal, foster, furthermore, moreover, additionally, utilize, facilitate, meticulous, elevate, landscape, realm, embark, game-changer, and the em dash (—). Use a comma or a new sentence instead of a dash.
