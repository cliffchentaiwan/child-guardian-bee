# 司法院裁判書開放 API 規格說明

## 重要資訊
- **API 服務時間**: 每日凌晨 0 時至 6 時（其餘時間不提供服務）
- **Token 有效期**: 6 小時，逾時需重新驗證
- **資料格式**: JSON

## API 端點

### 1. 驗證權限（取得 Token）
- **URL**: `https://data.judicial.gov.tw/jdg/api/Auth`
- **Method**: POST
- **Content-Type**: application/json
- **Request Body**:
```json
{
  "user": "帳號",
  "password": "密碼"
}
```
- **成功回應**:
```json
{
  "Token": "ddf8bb4f32f746bdb5510c1eed76db51"
}
```
- **失敗回應**:
```json
{
  "error": "驗證失敗"
}
```

### 2. 取得裁判書異動清單
- **URL**: `https://data.judicial.gov.tw/jdg/api/JList`
- **Method**: POST
- **Content-Type**: application/json
- **功能**: 取得 7 日前裁判書異動清單
- **Request Body**:
```json
{
  "token": "由第一組 API 所取得的 token"
}
```
- **回應**: 每日異動清單的陣列
```json
[
  {
    "date": "2016-12-23",
    "list": [
      "CDEV,105,橋司附民移調,101,20161219,1",
      "CDEV,105,橋司附民移調,95,20161219,1"
    ]
  }
]
```

### 3. 取得裁判書內容
- **URL**: `https://data.judicial.gov.tw/jdg/api/JDoc`
- **Method**: POST
- **Content-Type**: application/json
- **Request Body**:
```json
{
  "token": "由第一組 API 所取得的 token",
  "j": "CHDM,105,交訴,51,20161216,1"
}
```
- **回應欄位**:
  - ATTACHMENTS: 裁判書附檔（多組）
    - TITLE: 檔案標題
    - URL: 下載網址
  - JFULLX: 裁判書全文
    - JFULLTYPE: 全文型態（text 或 file）
    - JFULLCONTENT: 全文內容（若為 text）
    - JFULLPDF: 全文 PDF 連結（若為 file）
  - JID: 裁判書 ID（法院別+裁判類別,年度,字別,號次,裁判日期,檢查單號）
  - JYEAR: 年度
  - JCASE: 字別
  - JNO: 號次
  - JDATE: 裁判日期
  - JTITLE: 裁判案由

## 裁判類別代碼
- V: 民事
- M: 刑事
- A: 行政
- P: 懲戒
- C: 憲法

## 帳號資訊
- 帳號: crazy555059
- 密碼: crazy2626

## 注意事項
1. jid 為裁判書的 pkey，若 jid 相同代表是同一筆裁判書
2. 若 jid 出現在不同日期異動清單中，代表其內容可能有異動，應以後日期的內容覆蓋前日期的內容
3. 裁判書上傳後也可能變更為不可公開或從系統移除
4. 若系統回傳 `{"error":"查無資料，本裁判可能未公開或已從系統移除，若您曾經下載過本裁判，亦請您將其移除！謝謝！"}`，表示該筆裁判書業經本院移除或不再公開
