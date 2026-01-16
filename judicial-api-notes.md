# 司法院資料開放平台 API 規格

## 認證方式

1. 使用 HTTP POST 到 `https://opendata.judicial.gov.tw/api/MemberTokens`
2. Request Body:
```json
{
  "memberAccount": "帳號",
  "pwd": "密碼"
}
```
3. Response 會返回 JWT Token
4. 後續 API 呼叫需在 Header 加入: `Authorization: Bearer {Token}`

## 主要 API 端點

### 1. 取得主題分類清單
- URL: `https://opendata.judicial.gov.tw/data/api/rest/categories`
- 輸出: JSON 格式

### 2. 取得特定分類的資料源清單
- URL: `https://opendata.judicial.gov.tw/data/api/rest/categories/{categoryNo}/resources`

### 3. 下載資料檔案
- URL: `https://opendata.judicial.gov.tw/api/FilesetLists/{fileSetId}/file`
- 支援分頁: `?top={top}&skip={skip}`

## 注意事項
- 這個 API 主要提供批量資料下載（如 RAR/7Z 壓縮檔）
- 不是即時查詢 API，而是定期更新的資料集
- 裁判書資料按月份打包，每月約有一個 RAR 檔案
- 需要下載資料後在本地建立索引進行搜尋

## 可用資料
- 裁判書分類代碼: 051
- 最新資料: 202510裁判書 (2025年10月，2025/12/15更新)
- 格式: RAR 壓縮檔
- 另有 Delete-Infor 資料集 (CSV格式) 記錄已刪除的裁判書

## 實作策略
由於 API 只提供批量下載，建議採用以下策略：
1. 定期下載最新的裁判書資料
2. 解壓縮並解析 XML/JSON 格式的判決書
3. 篩選出兒少相關案件（性侵害、兒虐等）
4. 建立本地資料庫索引
5. 提供即時搜尋功能

## 帳號資訊
- 帳號: crazy555059
- Token 有效期: 約 24 小時
