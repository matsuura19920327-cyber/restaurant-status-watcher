import dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Environment variable ${key} is required`);
  return value;
}

export const config = {
  spreadsheetId: requireEnv('GOOGLE_SHEETS_SPREADSHEET_ID'),
  slackWebhookUrl: requireEnv('SLACK_WEBHOOK_URL'),
  requestIntervalMs: parseInt(process.env.REQUEST_INTERVAL_MS ?? '3000', 10),
  blockedThreshold: parseInt(process.env.BLOCKED_THRESHOLD ?? '5', 10),
  userAgent:
    process.env.USER_AGENT ??
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  timezone: process.env.TIMEZONE ?? 'Asia/Tokyo',
  // GOOGLE_APPLICATION_CREDENTIALS が設定されている場合はJWTは不要
  serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? '',
  privateKey: (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
};
