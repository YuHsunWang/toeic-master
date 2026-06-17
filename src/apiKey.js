const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim() ?? '';

export const MISSING_GEMINI_API_KEY_MESSAGE =
  '請先設定 Gemini API Key（.env.local 的 VITE_GEMINI_API_KEY）';

export function hasGeminiApiKey() {
  return geminiApiKey.length > 0;
}

export function getGeminiApiKey() {
  if (!hasGeminiApiKey()) {
    throw new Error(MISSING_GEMINI_API_KEY_MESSAGE);
  }
  return geminiApiKey;
}
