import { google, sheets_v4 } from 'googleapis';
import { config } from '../config';

export type SheetsClient = sheets_v4.Sheets;

export async function createSheetsClient(): Promise<SheetsClient> {
  let auth;

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // service_account.json ファイルを使用（ローカル開発）
    auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } else {
    // 環境変数から直接認証（GitHub Actions）
    auth = new google.auth.JWT({
      email: config.serviceAccountEmail,
      key: config.privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    await (auth as InstanceType<typeof google.auth.JWT>).authorize();
  }

  return google.sheets({ version: 'v4', auth });
}
