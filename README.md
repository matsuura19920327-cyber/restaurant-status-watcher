# restaurant-status-watcher

食べログ店舗ページの「掲載保留」ステータスを毎日チェックし、Slackに通知するバッチシステムです。

## 概要

Googleスプレッドシートに登録した食べログ店舗URLを毎日巡回し、ページが「掲載保留」になっているかどうかを判定します。  
掲載保留の店舗が見つかった場合は Slack に通知します。

### 検出対象の文言

- 掲載保留
- 店舗の運営状況の確認が出来ておらず
- 休業期間が未確定
- 移転・閉店の事実確認が出来ない

---

## セットアップ

### 1. Google Sheets の準備

スプレッドシートを新規作成し、以下の4つのシートを作成してください。

#### `shops` シート

| A | B | C | D | E | F | G | H | I | J | K | L |
|---|---|---|---|---|---|---|---|---|---|---|---|
| shop_id | source | shop_name | shop_url | area_name | genre | current_status | is_pending | first_found_at | last_checked_at | last_pending_detected_at | memo |

- 1行目はヘッダー行です
- `shop_url` に食べログの店舗ページURLを入力してください（例: `https://tabelog.com/tokyo/A1308/A130802/13264137/`）
- `shop_id` は入力しなくてもURLから自動生成されます（例: `tabelog_13264137`）
- `shop_name` / `area_name` / `genre` は通知メッセージに使用されます（任意）

#### `check_logs` シート

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| checked_at | shop_id | shop_name | shop_url | previous_status | current_status | alert_type | detected_text | error_message |

#### `alert_logs` シート

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| alerted_at | alert_type | shop_id | shop_name | shop_url | area_name | genre | slack_message |

#### `system_logs` シート

| A | B | C | D | E |
|---|---|---|---|---|
| occurred_at | level | process_name | error_type | error_message |

---

### 2. Google Service Account の準備

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. 「APIとサービス」→「有効なAPIとサービス」から **Google Sheets API** を有効化
3. 「認証情報」→「サービスアカウントを作成」でサービスアカウントを作成
4. サービスアカウントのメールアドレス（`xxx@xxx.iam.gserviceaccount.com`）を確認
5. 「鍵を追加」→「新しい鍵を作成」→ JSON形式でダウンロード
6. **スプレッドシートの「共有」にサービスアカウントのメールアドレスを追加**（編集者権限）

---

### 3. Slack Incoming Webhook の準備

1. [Slack API](https://api.slack.com/apps) でアプリを作成
2. 「Incoming Webhooks」を有効化
3. Webhook URLを取得（`https://hooks.slack.com/services/xxx/xxx/xxx`）

---

### 4. ローカル環境のセットアップ

```bash
# リポジトリのクローン or フォルダに移動
cd restaurant-status-watcher

# 依存パッケージのインストール
npm install

# .env ファイルの作成
cp .env.example .env
```

`.env` を編集して以下の値を設定してください。

```env
# スプレッドシートID（URLの /d/XXXX/ の部分）
GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id

# サービスアカウントのメールアドレス
GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@xxx.iam.gserviceaccount.com

# JSONキーファイルの private_key の値（改行は \n で表現）
GOOGLE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nXXXXX\n-----END RSA PRIVATE KEY-----\n"

# Slack Webhook URL
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/xxx/xxx

# リクエスト間隔（ミリ秒）
REQUEST_INTERVAL_MS=3000

# アクセス制限しきい値（この件数以上でその日の巡回を停止）
BLOCKED_THRESHOLD=5
```

> **GOOGLE_PRIVATE_KEY の設定方法**  
> ダウンロードした JSON ファイルの `private_key` の値をそのままコピーしてください。  
> 改行が `\n` として含まれた文字列になっています。値全体をダブルクォートで囲んでください。

---

## 実行方法

### 掲載保留チェック（本番実行）

```bash
npm run check
```

shopsシートの全店舗URLを巡回し、以下を実行します。

1. 各店舗ページの掲載保留チェック
2. shopsシートのステータス更新
3. check_logsへの記録
4. Slack通知（new_pending / continued_pending / recovered）
5. alert_logsへの記録

### 判定ロジックのテスト

```bash
# URLを指定してテスト（スプレッドシート不使用）
npm run test:status https://tabelog.com/tokyo/A1308/A130802/13264137/

# URLを省略するとサンプルURLを使用
npm run test:status
```

---

## ステータス定義

| ステータス | 説明 |
|-----------|------|
| `active` | ページ取得でき、掲載保留文言がない |
| `pending` | 掲載保留文言が検出された |
| `not_found` | 404 Not Found |
| `blocked` | 403 / CAPTCHA / アクセス制限 |
| `timeout` | タイムアウト |
| `parse_error` | HTML解析失敗 |
| `unknown` | その他不明なエラー |

## アラートタイプ

| タイプ | 条件 | Slack通知 |
|--------|------|-----------|
| `new_pending` | 前回が pending 以外 → 今回 pending | 個別通知 |
| `continued_pending` | 前回 pending → 今回も pending | 日次サマリー |
| `recovered` | 前回 pending → 今回 active | 個別通知 |
| `none` | 変化なし（active継続など） | なし |
| `error` | blocked / timeout など | なし（system_logsに記録） |

---

## GitHub Actions での自動実行

1. GitHubにリポジトリを作成してプッシュ
2. **Settings → Secrets and variables → Actions** で以下を設定

### Secrets（機密情報）

| 名前 | 値 |
|------|----|
| `GOOGLE_SHEETS_SPREADSHEET_ID` | スプレッドシートID |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | サービスアカウントメール |
| `GOOGLE_PRIVATE_KEY` | サービスアカウント秘密鍵 |
| `SLACK_WEBHOOK_URL` | Slack Webhook URL |

### Variables（非機密設定、任意）

| 名前 | デフォルト値 | 説明 |
|------|-------------|------|
| `REQUEST_INTERVAL_MS` | `3000` | リクエスト間隔（ミリ秒） |
| `BLOCKED_THRESHOLD` | `5` | アクセス制限しきい値 |
| `USER_AGENT` | Chrome UA | カスタムUser-Agent |

毎朝8:00（JST）に自動実行されます。手動実行は **Actions → Daily Restaurant Status Check → Run workflow** から可能です。

---

## ディレクトリ構成

```
restaurant-status-watcher/
├── src/
│   ├── index.ts              # メインエントリーポイント
│   ├── config.ts             # 環境変数読み込み
│   ├── testStatus.ts         # 判定テスト用スクリプト
│   ├── types.ts              # 型定義
│   ├── sheets/
│   │   ├── client.ts         # Google Sheets クライアント
│   │   ├── readShops.ts      # shopsシート読み込み
│   │   ├── updateShops.ts    # shopsシート更新
│   │   ├── writeCheckLogs.ts # check_logs書き込み
│   │   ├── writeAlertLogs.ts # alert_logs書き込み
│   │   └── writeSystemLogs.ts# system_logs書き込み
│   ├── scrapers/
│   │   ├── fetchTabelogPage.ts # 食べログページ取得
│   │   └── statusDetector.ts   # 掲載保留判定
│   ├── alerts/
│   │   └── slack.ts          # Slack通知
│   └── utils/
│       ├── sleep.ts          # スリープ
│       ├── logger.ts         # ログ出力
│       ├── normalizeUrl.ts   # URL正規化・shop_id生成
│       └── date.ts           # 日時ユーティリティ
├── .github/
│   └── workflows/
│       └── daily-check.yml   # GitHub Actions
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## エラー時の挙動

- `blocked` が `BLOCKED_THRESHOLD` 件以上 → その日の巡回を停止し Slack 通知
- 各エラーは `check_logs` または `system_logs` に記録
- Google Sheets 接続エラーは Slack に通知して終了

---

## Phase 2（将来の拡張予定）

以下の機能は MVP では実装しておらず、将来の拡張として検討しています。

- **食べログからの店舗URL自動収集**  
  キーワード・エリア検索から対象店舗を自動的に shopsシートへ追加する機能

- **店舗情報の変更検知**  
  店舗名・住所・評価・口コミ数・ジャンルなどの変更を検知する機能

- **Playwright による JavaScript レンダリング対応**  
  axios では取得できないページへの対応

- **Render Cron ジョブ対応**  
  GitHub Actions の代替として Render.com での定期実行設定
