/**
 * 初回セットアップスクリプト
 * 既存スプレッドシートに shops / check_logs / alert_logs / system_logs シートを追加し、
 * 各シートにヘッダー行を設定します。
 * Usage: npm run setup
 */
import dotenv from 'dotenv';
dotenv.config();

import { google } from 'googleapis';
import { logger } from './utils/logger';

const SHEETS_CONFIG = [
  {
    name: 'shops',
    headers: [
      'shop_id', 'source', 'shop_name', 'shop_url', 'area_name', 'genre',
      'current_status', 'is_pending', 'first_found_at', 'last_checked_at',
      'last_pending_detected_at', 'memo',
    ],
  },
  {
    name: 'check_logs',
    headers: [
      'checked_at', 'shop_id', 'shop_name', 'shop_url',
      'previous_status', 'current_status', 'alert_type', 'detected_text', 'error_message',
    ],
  },
  {
    name: 'alert_logs',
    headers: [
      'alerted_at', 'alert_type', 'shop_id', 'shop_name',
      'shop_url', 'area_name', 'genre', 'slack_message',
    ],
  },
  {
    name: 'system_logs',
    headers: ['occurred_at', 'level', 'process_name', 'error_type', 'error_message'],
  },
];

async function createAuth() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
  if (!email || !key) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS または GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY が必要です');
  }
  const jwt = new google.auth.JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  await jwt.authorize();
  return jwt;
}

async function main() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID が未設定です');

  logger.info('=== スプレッドシートセットアップ開始 ===');
  logger.info(`対象スプレッドシートID: ${spreadsheetId}`);

  const auth = await createAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // 既存シート一覧を取得
  const metaResp = await sheets.spreadsheets.get({ spreadsheetId });
  const existingSheets = (metaResp.data.sheets ?? []).map(
    (s) => s.properties?.title ?? '',
  );
  logger.info(`既存シート: ${existingSheets.join(', ')}`);

  // 追加が必要なシートのみ addSheet リクエストを作成
  const addRequests = SHEETS_CONFIG
    .filter((s) => !existingSheets.includes(s.name))
    .map((s, i) => ({
      addSheet: {
        properties: { title: s.name, index: existingSheets.length + i },
      },
    }));

  if (addRequests.length > 0) {
    logger.info(`シートを追加: ${addRequests.map((r) => r.addSheet.properties.title).join(', ')}`);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: addRequests },
    });
  } else {
    logger.info('追加対象のシートはありません（すでに存在）');
  }

  // 最新のシート情報を再取得
  const updatedMeta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetIdMap = new Map(
    (updatedMeta.data.sheets ?? []).map((s) => [
      s.properties?.title ?? '',
      s.properties?.sheetId ?? 0,
    ]),
  );

  // 各シートにヘッダーを設定
  logger.info('ヘッダー行を設定中...');
  const headerRequests = SHEETS_CONFIG
    .filter((s) => sheetIdMap.has(s.name))
    .map((s) => ({
      updateCells: {
        range: {
          sheetId: sheetIdMap.get(s.name)!,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: s.headers.length,
        },
        rows: [
          {
            values: s.headers.map((h) => ({
              userEnteredValue: { stringValue: h },
              userEnteredFormat: {
                backgroundColor: { red: 0.851, green: 0.918, blue: 0.827 },
                textFormat: { bold: true },
              },
            })),
          },
        ],
        fields: 'userEnteredValue,userEnteredFormat',
      },
    }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: headerRequests },
  });

  // 不要な「Sheet1」を削除
  if (existingSheets.includes('Sheet1') && sheetIdMap.has('Sheet1')) {
    logger.info('デフォルトシート「Sheet1」を削除');
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ deleteSheet: { sheetId: sheetIdMap.get('Sheet1')! } }],
      },
    });
  }

  logger.info('');
  logger.info('=== セットアップ完了 ===');
  logger.info(`スプレッドシートURL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  logger.info('');
  logger.info('作成したシート:');
  SHEETS_CONFIG.forEach((s) => logger.info(`  ✅ ${s.name}（${s.headers.length}列）`));
  logger.info('');
  logger.info('次のステップ: shopsシートに食べログURLを入力して npm run check を実行してください');
}

main().catch((error) => {
  logger.error(`セットアップ失敗: ${error}`);
  process.exit(1);
});
