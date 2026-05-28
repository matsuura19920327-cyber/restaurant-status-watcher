import { config } from '../config';
import { nowISO } from '../utils/date';
import { SheetsClient } from './client';

const SHEET = 'system_logs';

export async function writeSystemLog(
  sheets: SheetsClient,
  level: 'INFO' | 'WARN' | 'ERROR',
  processName: string,
  errorType: string,
  errorMessage: string,
): Promise<void> {
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.spreadsheetId,
    range: `${SHEET}!A:E`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[nowISO(), level, processName, errorType, errorMessage]],
    },
  });
}
