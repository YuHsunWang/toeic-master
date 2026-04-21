# StackBlitz 測試指南（5 分鐘跑起來，不用裝 Node.js）

## 一、上傳專案到 StackBlitz

1. 打開 [https://stackblitz.com/](https://stackblitz.com/)
2. 右上角點 **「Sign in」**，用 GitHub 或 Google 帳號登入（免費）
3. 登入後，左側選單點 **「My Projects」** 或右上角 **「+」** → **「Import a Project」**
4. 選 **「Upload Folder」**（上傳資料夾），或直接用拖曳的：
   - 把剛剛下載的 zip 檔**解壓縮**
   - 把解壓出來的 `toeic-master` 資料夾整個**拖進**瀏覽器的 StackBlitz 頁面

> 如果 Upload Folder 找不到：
> 另一個方法是手動建立 Vite + React 專案（右上角 "+" → Vite → React），然後把我 zip 裡的每個檔案內容**複製貼上**到 StackBlitz 裡對應的位置。麻煩一點但一定會成功。

## 二、等它自動裝套件

上傳完 StackBlitz 會：
1. 自動偵測是 Vite 專案
2. 自動執行 `npm install`（約 30 秒到 1 分鐘）
3. 自動執行 `npm run dev`
4. 右側面板跑出一個預覽視窗，顯示 App UI

如果右側沒自動開預覽，看底下的 **「Terminal」** 有沒有跑出類似 `Local: http://localhost:5173` 的訊息。如果有，點一下那個網址就會開預覽。

## 三、測試流程

### 測試 1：App 成功啟動
- 應該看到深色介面、TOEIC Master 標題
- 下方會自動出現 8 個內建單字（首次開啟自動匯入）
- 右上角「On」綠點 = 線上

### 測試 2：播發音（瀏覽器內建語音）
- 點任一單字旁邊的**喇叭圖示**
- 會聽到瀏覽器內建語音唸出單字（音質普通但能用）
- 例句也可以點播放按鈕

> ⚠️ StackBlitz 預覽視窗的聲音有時候要先點一下畫面才會啟用（瀏覽器自動播放限制）。如果第一次沒聲音，點一下 App 區域再按喇叭就會有了。

### 測試 3：標記已掌握
- 點單字右側的勾勾按鈕
- 那張卡片會變灰、標籤變「Mastered」
- 右上角「Mastery Rate」百分比會更新

### 測試 4：篩選 / 搜尋
- 試試點上方的「Reading / Listening / Both」分類按鈕
- 在搜尋框輸入「協商」或「invoice」測試搜尋

### 測試 5：離線儲存驗證（最重要）
- 按 F5 重新整理頁面
- 單字和「已掌握」狀態**應該都還在**（這證明 IndexedDB 儲存成功）

### 測試 6：真正離線測試
- StackBlitz 右側預覽視窗上方有個**新開視窗的圖示**（或右鍵預覽 → 「Open in New Tab」）
- 在新分頁打開後，網址會變成類似 `xxx.stackblitz.io` 的真實網址
- 把這個網址存起來
- 開 Chrome DevTools（F12）→ Network 分頁 → 勾選「Offline」
- 重新整理頁面，App **應該還能正常開啟並顯示單字**（Service Worker 在運作）

## 四、到手機上測試 PWA 安裝

1. 在 StackBlitz 預覽視窗點「Open in New Tab」取得真實網址
2. 手機瀏覽器（Chrome 或 Safari）打開那個網址
3. **Android**：選單 → 「加到主畫面」或「安裝應用程式」
4. **iOS**：下方分享按鈕 → 「加入主畫面」
5. 回到主畫面會看到 TOEIC Master 的圖示，點它開啟會像獨立 App 一樣（沒有瀏覽器網址列）

## 常見問題

**Q：StackBlitz 卡在安裝畫面？**
A：重新整理頁面重試。有時候是網路問題。

**Q：預覽視窗一片白？**
A：看底下 Terminal 有沒有紅字錯誤。如果有，把錯誤貼給我看。

**Q：發音沒聲音？**
A：1) 先點一下 App 區域啟用音訊權限 2) 檢查系統音量 3) Chrome 比 Safari 更穩定，建議用 Chrome

**Q：想清掉所有資料重新測試？**
A：F12 → Application 分頁 → Storage → IndexedDB → 刪除 ToeicMasterDB；另外 Local Storage 裡有個 `toeic_master_seeded` 也刪掉，重新整理後就會再次自動塞種子資料

## 想加 API key 試完整功能？

1. 取得 key: [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. 在 StackBlitz 左側檔案樹找到 `.env.example` → 右鍵 Duplicate → 改名為 `.env.local`
3. 填入 `VITE_GEMINI_API_KEY=你的key`
4. 在 Terminal 按 Ctrl+C 停掉 dev server，重新執行 `npm run dev`
5. 現在「獲取 AI 新單字」和高音質發音都能用了
