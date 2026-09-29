# 守護小蜂：Cloudflare 資料串接測試版

這是可在本機驗證的遷移第一階段，尚未部署、未啟用排程、未設定通知，也未取代 Render 正式網站。現有根目錄程式不變。本階段只查詢機構名錄，不提供裁罰、判決、個人姓名查詢或安全評分。

## 已接入來源

| 來源 | 範圍與更新週期 | 2026-09-29 實測 |
| --- | --- | --- |
| [教育部幼兒園名錄](https://data.gov.tw/dataset/6086) | 全臺；來源每學年度更新 | 原始 74,628 筆跨年度資料，選出最新 114 學年度 6,747 筆 |
| [教育部立案短期補習班名錄](https://data.gov.tw/dataset/16461) | 測試僅接臺北市；來源標示每日更新 | 2,628 筆，2,627 個不同代碼，保留同代碼但名稱/地址不同的紀錄 |

兩者標示政府資料開放授權條款第 1 版。頁面保留來源連結、取得時間、來源學年度；不把下載日期當成資料發布日。只保存名錄查詢必要欄位，不匯入來源電子郵件。原始檔與本機資料庫不提交 Git。

## 本機使用

Node.js 24 以上；本機測試不需安裝依賴。

```sh
cd cloudflare
npm test
npm run audit
npm run preview
```

`audit` 下載兩個官方來源到本機測試資料庫並跑搜尋；需要網路。也可 `node scripts/audit.mjs /path/to/input-folder` 使用已下載的 `preschools.json` 和 `cram-taipei.json`。預覽限定本機 `http://127.0.0.1:8788`。測試使用 Node SQLite 模擬 D1 prepare/batch，不代表已通過 Cloudflare 真實執行環境、資源限制或費用驗證。

## 更新保護

- 每個來源分開下載與發布，下載失敗重試最多三次。
- 最新學年度篩選、必要欄位與筆數範圍驗證、拒絕年度倒退。
- 筆數較上一版下降超過 20% 時停止發布，待確認來源變化；不是自動刪除舊紀錄。
- 新資料先寫入獨立 snapshot，全部完成後才切換公開版本；中途錯誤保留上次成功資料。
- 發布使用條件更新，避免較舊的並行任務覆蓋較新版本。
- 非公開版本保留七日再清理，現行公開版本不因清理被刪除。
- 查詢故障與資料尚未就緒回傳 HTTP 503，不冒充「沒有紀錄」。
- 最後成功取得超過三日標記資料過舊；這是取得健康度，不代表年度來源應每天發布新資料。

## Cloudflare 啟用前必做

1. 使用擁有者自己的 Cloudflare 帳戶完成註冊、驗證和部署授權。
2. 建立全新 **pilot** D1，不連舊資料庫；複製 `wrangler.example.jsonc` 為 `wrangler.jsonc`，填入新資料庫 ID。真實設定檔與 secrets 不提交 Git。
3. 用官方 Wrangler 在本機 D1 套用 migration、驗證 Worker，再於 pilot 遠端資料庫套用；檢查 20 MB 幼兒園來源的下載、解析記憶體及 D1 批次用量。現在只有 Node SQLite 驗證，尚無 Workers 實測。
4. 完成來源失敗與未執行監測，將外部告警接到擁有者指定的營運信箱，實際測試收信。僅有 Worker log 不足以監控整個排程沒有啟動。
5. 完成費用與資源限制實測後，才設定 `SYNC_ENABLED=true` 及 cron（例如 UTC `17 19 * * *`，臺灣每日 03:17）。範本預設不啟用，防止未就緒時產生排程或費用。
6. 擴充補習班其他縣市、接入可核對的官方裁罰資料；機構與事件分表，不能以姓名相似度當作同一人或風險分數。
7. 加入流量限制、外部健康監測、資料庫備份/還原演練、正式版隱私/申訴流程後，才切換正式網址。

沒有公開的手動同步端點。搜尋不要求會員，也不儲存搜尋詞、IP 或個人會員資料。

## 舊資料保留盤點

只讀檢查 repository 中已存在的 SQLite 檔案：`sqlite.db` 有 4,340 筆案件，`sqlite.db.backup_20260126` 有 2,122 筆。主檔來源分類為 CRC 1,723、ECE 1,806、司法 499、新聞 312。

這些是本機歷史副本，**未證實等於目前線上資料，也未驗證內容正確、仍有效或可直接公開**。其 schema 與目前 PostgreSQL schema 不同。沒有刪改、沒有匯入新版，也不複製其中的通報/搜尋紀錄到新平台。下一步仍須從現有 Render `DATABASE_URL` 的主機資訊辨識線上來源，再決定備份和遷移方式。

## 已驗證／未驗證

- 已驗證：兩個官方下載、本機實際資料匯入與查詢、10 項失敗/一致性/輸入測試、瀏覽器實際搜尋。
- 未驗證：Cloudflare runtime、遠端 D1、實際 cron、告警信件、效能/費用與正式流量。
- 尚未加入：兒少全範圍資料來源、裁罰案件、判決、個人搜尋、LINE。

官方文件：[D1 批次交易](https://developers.cloudflare.com/d1/worker-api/d1-database/)、[Workers 靜態資源](https://developers.cloudflare.com/workers/static-assets/binding/)、[Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)。
