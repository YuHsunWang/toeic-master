# TOEIC Master (PWA 離線版)

AI 驅動的多益單字 App，支援離線使用、可安裝到手機主畫面。

## 架構

- **前端**: React + Vite + Tailwind
- **本地資料庫**: IndexedDB（透過 Dexie.js）
  - `vocab` 表：單字本
  - `ttsCache` 表：發音音檔快取
- **PWA**: vite-plugin-pwa（Workbox）
- **AI**: Gemini（生成單字 + 高音質 TTS）
- **離線發音 fallback**: 瀏覽器內建 `SpeechSynthesis`

## 發音三層 fallback

1. IndexedDB 快取（最快、完全離線）
2. Gemini TTS API（線上高音質，會寫入快取）
3. `window.speechSynthesis`（離線 fallback，音質普通但一定能用）

## 安裝與執行

```bash
# 1. 安裝依賴
npm install

# 2. 設定 API Key（取得: https://aistudio.google.com/app/apikey）
cp .env.example .env.local
# 編輯 .env.local，填入 VITE_GEMINI_API_KEY

# 3. 開發模式
npm run dev

# 4. 打包 production 版本
npm run build

# 5. 本地預覽 production build（測試 PWA 離線功能要用這個）
npm run preview
```

## 使用流程

1. 第一次打開 App → 按「獲取 AI 新單字」累積單字
2. 有網路時按「預載發音供離線使用」→ 把所有單字的高音質發音存到快取
3. 之後即使完全離線，App 也能開啟、瀏覽、播發音、標記已掌握
4. 離線時若要播放未快取的句子，會自動切換到瀏覽器內建語音

## PWA 安裝

- **iOS Safari**: 分享 → 加入主畫面
- **Android Chrome**: 選單 → 加到主畫面 / 安裝應用程式
- **桌面 Chrome**: 網址列右側安裝圖示

## 部署

靜態網站任何平台都可以：Vercel、Netlify、Cloudflare Pages、GitHub Pages 等。
只要 `npm run build` 後把 `dist/` 目錄丟上去就好。

**重要**：PWA 必須跑在 HTTPS（或 localhost），否則 Service Worker 不會註冊。

## 要補的圖示

`public/` 下需要放這兩個 PNG 給 PWA 安裝時用（現在先用 favicon 撐著，能跑但裝到主畫面會是預設圖示）：
- `pwa-192x192.png`（192x192）
- `pwa-512x512.png`（512x512）

快速做法：用 https://realfavicongenerator.net/ 或 https://maskable.app/ 生一組。

## 如果以後想上架 App Store / Play Store

這份 PWA 可以直接用 **Capacitor** 包成原生 App：

```bash
npm install @capacitor/core @capacitor/cli
npx cap init
npx cap add ios
npx cap add android
npm run build
npx cap copy
npx cap open ios   # 或 android
```

程式碼幾乎不用改。
