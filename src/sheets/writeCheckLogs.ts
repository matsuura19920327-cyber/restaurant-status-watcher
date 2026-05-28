import { config } from '../config';
import { CheckResult } from '../types';
import { SheetsClient } from './client';

const SHEET = 'check_logs';

export async function writeCheckLog(
  sheets: SheetsClient,
  result: CheckResult,
  checkedAt: string,
): Promise<void> {
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.spreadsheetId,
    range: `${SHEET}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [
        [
          checkedAt,
          result.shop.shopId,
          result.shop.shopName,
          result.shop.shopUrl,
          result.previousStatus,
          result.currentStatus,
          result.alertType,
          result.detectedText ?? '',
          result.errorMessage ?? '',
        ],
      ],
    },
  });
}
